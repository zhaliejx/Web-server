'use client';

// ── Recent searches — 3-day rolling history, all media ──────────────────────
// Searches are remembered per medium (anime / manga / drama) and expire
// automatically 72 hours after they were made: every read and write prunes
// expired entries, so a search "stays for 3 days then clears itself" with no
// timers, no service worker and no server storage. Everything lives in one
// localStorage key; a mount-time sweep in AjestApp purges stale entries even
// if no search view is ever opened.

export type RecentMedium = 'anime' | 'manga' | 'drama';

const KEY = 'ajest.recent.v1';
const TTL_MS = 3 * 24 * 60 * 60 * 1000; // 72h — the retention window
const MAX_TOTAL = 36; // global cap across media (12 per medium at write time)

interface RecentEntry {
  q: string;
  m: RecentMedium;
  at: number;
}

function readAll(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RecentEntry[] = [];
    for (const row of parsed) {
      if (
        row &&
        typeof row === 'object' &&
        typeof (row as RecentEntry).q === 'string' &&
        typeof (row as RecentEntry).at === 'number' &&
        ((row as RecentEntry).m === 'anime' || (row as RecentEntry).m === 'manga' || (row as RecentEntry).m === 'drama')
      ) {
        out.push({ q: (row as RecentEntry).q, m: (row as RecentEntry).m, at: (row as RecentEntry).at });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function writeAll(rows: RecentEntry[]) {
  try {
    if (rows.length) window.localStorage.setItem(KEY, JSON.stringify(rows));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — history is best-effort */
  }
}

/** Drop every entry older than the 3-day window. Returns true when something was pruned. */
export function purgeExpiredSearches(): boolean {
  const fresh = readAll().filter((r) => Date.now() - r.at < TTL_MS);
  const all = readAll();
  if (fresh.length === all.length) return false;
  writeAll(fresh);
  return true;
}

/** Record a search (dedupes within the medium — re-searching bumps it to the top). */
export function recordSearch(medium: RecentMedium, query: string) {
  const q = query.trim().slice(0, 80);
  if (!q) return;
  const now = Date.now();
  const rest = readAll().filter((r) => !(r.m === medium && r.q.toLowerCase() === q.toLowerCase()));
  const next = [{ q, m: medium, at: now }, ...rest]
    .filter((r) => now - r.at < TTL_MS)
    .slice(0, MAX_TOTAL);
  writeAll(next);
}

/** Recent searches for one medium, newest first — expired entries never surface. */
export function getRecentSearches(medium: RecentMedium, limit = 8): string[] {
  const now = Date.now();
  const fresh = readAll().filter((r) => now - r.at < TTL_MS && r.m === medium);
  if (fresh.length !== readAll().length) purgeExpiredSearches();
  return fresh.slice(0, limit).map((r) => r.q);
}

/** Wipe the whole recent-search history (every medium). */
export function clearRecentSearches() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
