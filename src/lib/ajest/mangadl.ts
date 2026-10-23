'use client';

// ── Offline manga downloads — IndexedDB chapter cache ────────────────────────
// Chapters are saved as raw image Blobs keyed by chapter id, so a downloaded
// chapter reads with ZERO network (subway, dead zones, data caps). Retention
// mirrors the search-history rule: entries expire after 3 days, purged on app
// mount and on every reader open. A total-size budget (250 MB) evicts the
// oldest downloads first so storage never silently balloons.
//
// Why same-origin passthrough: MangaPill's CDN requires a mangapill.com
// Referer no browser can send, MangaDex at-home URLs rotate and are CORS-
// inconsistent — the reader fetches bytes through /api/manga/dl (allowlisted
// hosts only) and stores the resulting Blobs, which never expire.

export interface MangaDownload {
  id: string; // chapter id (mpc:/mrc:/MangaDex uuid)
  mangaId: string;
  mangaTitle: string;
  chapterNumber: string;
  blobs: Blob[];
  bytes: number;
  savedAt: number;
}

const DB_NAME = 'ajest-dl';
const STORE = 'chapters';
export const DOWNLOAD_TTL_MS = 3 * 24 * 3600 * 1000; // 3 days, like search history
export const DOWNLOAD_BUDGET_BYTES = 250 * 1024 * 1024; // 250 MB total

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
        t.oncomplete = () => db.close();
      })
  );
}

export async function saveChapter(rec: MangaDownload): Promise<void> {
  await tx('readwrite', (s) => s.put(rec) as unknown as IDBRequest<void>);
}

export async function getChapter(id: string): Promise<MangaDownload | null> {
  const rec = await tx<MangaDownload | undefined>('readonly', (s) => s.get(id) as IDBRequest<MangaDownload | undefined>);
  return rec || null;
}

export async function deleteChapter(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id) as unknown as IDBRequest<void>);
}

/** All downloads WITHOUT blobs (metadata + sizes only). */
export async function listDownloads(): Promise<Omit<MangaDownload, 'blobs'>[]> {
  const all = await tx<MangaDownload[]>('readonly', (s) => s.getAll() as IDBRequest<MangaDownload[]>);
  return all.map(({ blobs: _blobs, ...meta }) => meta);
}

/** Drop downloads older than the TTL. Returns how many were purged. */
export async function purgeExpiredDownloads(maxAgeMs = DOWNLOAD_TTL_MS): Promise<number> {
  try {
    const all = await tx<MangaDownload[]>('readonly', (s) => s.getAll() as IDBRequest<MangaDownload[]>);
    const stale = all.filter((r) => Date.now() - r.savedAt > maxAgeMs);
    for (const r of stale) await deleteChapter(r.id);
    return stale.length;
  } catch {
    return 0;
  }
}

/** Enforce the total-size budget — oldest downloads go first. */
export async function evictOverBudget(maxBytes = DOWNLOAD_BUDGET_BYTES): Promise<number> {
  try {
    const all = await tx<MangaDownload[]>('readonly', (s) => s.getAll() as IDBRequest<MangaDownload[]>);
    let total = all.reduce((n, r) => n + r.bytes, 0);
    if (total <= maxBytes) return 0;
    const oldest = [...all].sort((a, b) => a.savedAt - b.savedAt);
    let evicted = 0;
    for (const r of oldest) {
      if (total <= maxBytes) break;
      total -= r.bytes;
      await deleteChapter(r.id);
      evicted++;
    }
    return evicted;
  } catch {
    return 0;
  }
}

/** Fetch one page's bytes. Origin-relative URLs (pill relay) go direct;
 *  absolute upstream URLs ride the allowlisted /api/manga/dl passthrough.
 *  Three attempts with growing backoff — one flaky CDN hop shouldn't kill
 *  the chapter. */
async function fetchPageBlob(url: string): Promise<Blob> {
  const href = url.startsWith('/') ? url : `/api/manga/dl?u=${encodeURIComponent(url)}`;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(href, { cache: 'no-store' });
      if (!r.ok) throw new Error(`page fetch ${r.status}`);
      return await r.blob();
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('page fetch failed');
}

/** Download every page of a chapter with per-page progress, then persist.
 *  CDN nodes flap under burst load (a page can 502 mid-run and serve fine
 *  seconds later), so failures are tolerated and re-swept up to 3 passes —
 *  a later sweep re-fetches ONLY the missing pages after a cool-off, with
 *  getAlt offering a freshly-assigned mirror URL per page. */
export async function downloadChapter(
  pages: string[],
  meta: Pick<MangaDownload, 'id' | 'mangaId' | 'mangaTitle' | 'chapterNumber'>,
  onProgress?: (done: number, total: number) => void,
  getAlt?: (index: number, url: string) => Promise<string | null>
): Promise<MangaDownload> {
  const blobs: (Blob | null)[] = new Array(pages.length).fill(null);
  let done = 0;
  const SWEEPS = 3;
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const missing: number[] = [];
    blobs.forEach((b, i) => {
      if (!b) missing.push(i);
    });
    if (!missing.length) break;
    // Cool-off before re-sweeping — flapping nodes usually recover in seconds
    if (sweep > 0) await new Promise((r) => setTimeout(r, 2500 * sweep));
    for (const i of missing) {
      let blob: Blob | null = null;
      try {
        blob = await fetchPageBlob(pages[i]);
      } catch {
        blob = null;
      }
      if (!blob && getAlt) {
        const alt = await getAlt(i, pages[i]).catch(() => null);
        if (alt && alt !== pages[i]) {
          try {
            blob = await fetchPageBlob(alt);
          } catch {
            blob = null;
          }
        }
      }
      if (blob) {
        blobs[i] = blob;
        done++;
        onProgress?.(done, pages.length);
      }
    }
  }
  const failed = blobs.reduce((n, b) => (b ? n : n + 1), 0);
  if (failed) {
    throw new Error(`${failed} page(s) unavailable from every mirror — try again in a moment`);
  }
  const finalBlobs = blobs as Blob[];
  const bytes = finalBlobs.reduce((n, b) => n + b.size, 0);
  const rec: MangaDownload = { ...meta, blobs: finalBlobs, bytes, savedAt: Date.now() };
  await saveChapter(rec);
  await evictOverBudget();
  return rec;
}

/** True when the reader can reach the network for non-downloaded chapters. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}
