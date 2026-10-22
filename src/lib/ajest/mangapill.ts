// ── MangaPill upstream — HTML scraping engine for the manga tier ────────────
// MangaPill (mangapill.com) serves fully-rendered HTML with stable markup and
// a permissive layout — the manga counterpart of gogo.ts. Pipeline (each step
// verified live against the real site):
//   1. /search?q=…                 → /manga/{id}/{slug} cards (cover + title)
//   2. /manga/{id}/{slug}          → title, synopsis, type/status/year, genres
//                                    and the FULL chapter list on one page
//   3. /chapters/{m}-{c}/{slug}    → <img class="js-page" data-src="{cdn}"> pages
// The CDN only serves images with a mangapill.com Referer, so every image URL
// is rewritten through /api/manga/image (strict host allowlist).
// Ids ride a dedicated namespace so the gateway can dispatch per-source:
//   manga   → mp:{numericId}:{slug}      e.g. mp:2:one-piece
//   chapter → mpc:{m}-{c}/{chapterSlug}  e.g. mpc:2-10001000/one-piece-chapter-1

import { cached } from './upstream';
import type { MangaChapter, MangaItem } from './types';

export const PILL_BASE = 'https://mangapill.com';
/** Hosts this scraper emits image URLs from — the image relay allowlists them */
export const PILL_CDN_HOSTS = ['cdn.readdetectiveconan.com'];

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** HTML-page headers — the CDN requires the mangapill Referer to serve bytes */
export const PILL_HEADERS: Record<string, string> = {
  'User-Agent': BROWSER_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${PILL_BASE}/`,
};

/** Image-request headers for the relay (CDN checks Referer + a real UA) */
export const PILL_IMAGE_HEADERS: Record<string, string> = {
  'User-Agent': BROWSER_UA,
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${PILL_BASE}/`,
};

// ── Fetch + decode helpers ───────────────────────────────────────────────────

async function pillFetchHtml(url: string, timeoutMs = 14000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: PILL_HEADERS,
    });
    if (!res.ok) throw new Error(`MangaPill ${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&hellip;/g, '…');
}

// ── Id namespacing ───────────────────────────────────────────────────────────

export function isPillMangaId(id: string): boolean {
  return id.startsWith('mp:');
}

export function isPillChapterId(id: string): boolean {
  return id.startsWith('mpc:');
}

function parsePillMangaId(id: string): { num: string; slug: string } | null {
  if (!isPillMangaId(id)) return null;
  const rest = id.slice(3);
  const cut = rest.indexOf(':');
  if (cut <= 0 || cut === rest.length - 1) return null;
  const num = rest.slice(0, cut);
  const slug = rest.slice(cut + 1);
  if (!/^\d+$/.test(num) || !/^[a-z0-9-]+$/.test(slug)) return null;
  return { num, slug };
}

function parsePillChapterId(id: string): { path: string } | null {
  if (!isPillChapterId(id)) return null;
  const path = id.slice(4);
  // {mangaId}-{chapterId}/{chapter-slug} — slug chars only, no traversal
  if (!/^\d+-\d+\/[a-z0-9.-]+$/.test(path)) return null;
  return { path };
}

/** Rewrite a MangaPill CDN url through the allowlisted image relay */
function relay(url: string): string {
  return url ? `/api/manga/image?u=${encodeURIComponent(url)}` : '';
}

// ── Shared MangaItem builder ────────────────────────────────────────────────

function pillItemBase(id: string, title: string, cover: string): MangaItem {
  return {
    id,
    title,
    cover,
    description: '',
    status: 'unknown',
    contentRating: 'safe',
    tags: [],
    origin: 'other',
    source: 'mangapill',
  };
}

// ── Step 1: search ───────────────────────────────────────────────────────────

export async function pillSearch(q: string, limit = 20): Promise<MangaItem[]> {
  return cached(`pill:search:v1:${q.toLowerCase()}`, 10 * 60_000, async () => {
    const html = await pillFetchHtml(`${PILL_BASE}/search?q=${encodeURIComponent(q)}`);
    const out: MangaItem[] = [];
    const seen = new Set<string>();
    // Each card references the series twice (cover anchor + title anchor);
    // first occurrence per id is the cover block that also carries the title.
    const re = /href="\/manga\/(\d+)\/([a-z0-9-]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < limit) {
      const key = `${m[1]}/${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const block = html.slice(m.index, m.index + 1400);
      const cover = block.match(/data-src="([^"]+)"/)?.[1] || '';
      const rawTitle = block.match(/font-black leading-tight[^"]*">([^<]+)</)?.[1];
      if (!rawTitle) continue;
      out.push(pillItemBase(`mp:${m[1]}:${m[2]}`, decodeEntities(rawTitle).trim(), relay(cover)));
    }
    return out;
  });
}

// ── Step 2: series page (detail + full chapter list share one fetch) ────────

async function pillMangaHtml(num: string, slug: string): Promise<string> {
  return cached(`pill:html:${num}/${slug}`, 15 * 60_000, () =>
    pillFetchHtml(`${PILL_BASE}/manga/${num}/${slug}`)
  );
}

/** <label class="text-secondary">Status</label><div>publishing</div> rows */
function labelAfter(html: string, label: string): string {
  const re = new RegExp(`label class="text-secondary">${label}</label>\\s*<div[^>]*>([^<]+)<`, 'i');
  return decodeEntities(html.match(re)?.[1] || '').trim().toLowerCase();
}

function pillStatus(status: string): string {
  if (status === 'publishing' || status === 'ongoing') return 'ongoing';
  if (status === 'completed' || status === 'finished') return 'completed';
  if (status.includes('hiatus')) return 'hiatus';
  if (status.includes('cancel') || status.includes('discontinued')) return 'cancelled';
  return 'unknown';
}

function pillOrigin(type: string): MangaItem['origin'] {
  if (type === 'manhwa') return 'kr';
  if (type === 'manhua') return 'cn';
  if (type === 'manga') return 'jp';
  return 'other';
}

export async function pillDetail(id: string): Promise<MangaItem> {
  const parsed = parsePillMangaId(id);
  if (!parsed) throw new Error(`Bad MangaPill id: ${id}`);
  const html = await pillMangaHtml(parsed.num, parsed.slug);

  const pick = (re: RegExp) => decodeEntities(html.match(re)?.[1] || '').trim();
  const title = pick(/<h1[^>]*>([^<]+)<\/h1>/);
  if (!title) throw new Error('MangaPill series page parse failed');
  const cover = pick(/property="og:image" content="([^"]+)"/);
  // Synopsis sits in a <p class="text-sm text--secondary"> (site's own typo)
  const synopsis = pick(/<p class="text-sm text--secondary">([\s\S]*?)<\/p>/)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const item = pillItemBase(id, title, relay(cover));
  item.description = synopsis;
  item.status = pillStatus(labelAfter(html, 'Status'));
  item.origin = pillOrigin(labelAfter(html, 'Type'));
  const year = parseInt(labelAfter(html, 'Year'), 10);
  if (Number.isFinite(year) && year > 1900) item.year = year;
  item.tags = Array.from(html.matchAll(/href="\/search\?genre=([^"]+)"/g))
    .map((g) => decodeEntities(g[1]).trim())
    .filter(Boolean)
    .slice(0, 12);
  return item;
}

// ── Chapter list (from the same series page, newest-first) ──────────────────

export async function pillChapters(id: string): Promise<MangaChapter[]> {
  const parsed = parsePillMangaId(id);
  if (!parsed) throw new Error(`Bad MangaPill id: ${id}`);
  return cached(`pill:feed:v1:${id}`, 10 * 60_000, async () => {
    const html = await pillMangaHtml(parsed.num, parsed.slug);
    const out: MangaChapter[] = [];
    const seen = new Set<string>();
    const re = /href="\/chapters\/(\d+-\d+)\/([a-z0-9.-]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const [, mc, slug] = m;
      if (seen.has(mc)) continue;
      seen.add(mc);
      // "sousou-no-frieren-chapter-14-5" → 14.5 (hyphen decimals → dots)
      const numMatch = slug.match(/-chapter-([0-9][0-9.-]*)$/);
      if (!numMatch) continue; // volume extras / one-shots without numbers
      const number = numMatch[1].replace(/-(?=\d)/g, '.').replace(/\.$/, '');
      out.push({ id: `mpc:${mc}/${slug}`, number, pages: 0, at: 0, source: 'mangapill' });
    }
    // The page may surface "read first/latest" buttons before the list —
    // enforce newest-first by chapter number regardless of DOM order.
    return out.sort((a, b) => (parseFloat(b.number) || 0) - (parseFloat(a.number) || 0));
  });
}

// ── Step 3: chapter page → page image urls ──────────────────────────────────

export async function pillPages(chapterId: string): Promise<string[]> {
  const parsed = parsePillChapterId(chapterId);
  if (!parsed) throw new Error(`Bad MangaPill chapter id`);
  // Unlike MangaDex at-home links (rotating), pill CDN paths are permanent —
  // a generous cache keeps re-reads instant.
  return cached(`pill:pages:v1:${parsed.path}`, 30 * 60_000, async () => {
    const html = await pillFetchHtml(`${PILL_BASE}/chapters/${parsed.path}`);
    const pages: string[] = [];
    const re = /<img[^>]*js-page[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const src = m[0].match(/data-src="([^"]+)"/)?.[1];
      if (src) pages.push(relay(src));
    }
    return pages;
  });
}
