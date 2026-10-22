// ── MangaRead upstream — Madara/WordPress scraping engine ────────────────────
// mangaread.org is a large Madara-based mirror (Solo Leveling, My Dress-Up
// Darling and thousands of other licensed titles MangaDex can't serve readably).
// All steps verified live from Node's fetch (no Cloudflare interference):
//   1. /?s={q}&post_type=wp-manga      → /manga/{slug}/ cards
//   2. /manga/{slug}/                  → meta + FULL inline chapter list
//      (unknown slugs soft-404 by redirecting home — detected via final URL)
//   3. chapter pages embed every page image inline in .reading-content
//      (img src contains raw newlines — extraction is whitespace-tolerant)
// Page images hotlink fine with no referer — they go straight to the reader.
// Ids: manga → mr:{slug}   chapter → mrc:manga/{slug}/chapter-{n}

import { cached } from './upstream';
import type { MangaChapter, MangaItem } from './types';

export const MR_BASE = 'https://www.mangaread.org';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const MR_HEADERS: Record<string, string> = {
  'User-Agent': BROWSER_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${MR_BASE}/`,
};

// ── Fetch + decode helpers ───────────────────────────────────────────────────

async function mrFetchHtml(url: string, timeoutMs = 14000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: MR_HEADERS,
    });
    if (!res.ok) throw new Error(`MangaRead ${res.status} ${url}`);
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

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// ── Id namespacing ───────────────────────────────────────────────────────────

export function isMrMangaId(id: string): boolean {
  return id.startsWith('mr:');
}

export function isMrChapterId(id: string): boolean {
  return id.startsWith('mrc:');
}

function parseMrMangaId(id: string): { slug: string } | null {
  if (!isMrMangaId(id)) return null;
  const slug = id.slice(3);
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return { slug };
}

function parseMrChapterId(id: string): { path: string } | null {
  if (!isMrChapterId(id)) return null;
  const path = id.slice(4);
  // manga/{slug}/chapter-{n} — no traversal, slug chars only
  if (!/^manga\/[a-z0-9-]+\/chapter-[0-9][0-9.a-z-]*$/i.test(path)) return null;
  return { path };
}

function itemBase(id: string, title: string, cover: string): MangaItem {
  return {
    id,
    title,
    cover,
    description: '',
    status: 'unknown',
    contentRating: 'safe',
    tags: [],
    origin: 'other',
    source: 'mangaread',
  };
}

// ── Step 1: search ───────────────────────────────────────────────────────────

export async function mrSearch(q: string, limit = 16): Promise<MangaItem[]> {
  return cached(`mr:search:v1:${q.toLowerCase()}`, 10 * 60_000, async () => {
    const html = await mrFetchHtml(`${MR_BASE}/?s=${encodeURIComponent(q)}&post_type=wp-manga`);
    const out: MangaItem[] = [];
    const byUrl = new Map<string, string>();
    // Card anchors put the title text immediately after the href quote
    const re = /href="(https:\/\/www\.mangaread\.org\/manga\/([a-z0-9-]+)\/)">([^<]{1,90})</g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const [, url, slug, rawTitle] = m;
      const title = stripTags(rawTitle);
      if (!title || !byUrl.has(url)) byUrl.set(url, title);
    }
    for (const [url, title] of byUrl) {
      if (out.length >= limit) break;
      const slug = url.match(/\/manga\/([a-z0-9-]+)\//)?.[1];
      if (!slug) continue;
      out.push(itemBase(`mr:${slug}`, title, ''));
    }
    return out;
  });
}

// ── Step 2: series page ──────────────────────────────────────────────────────

/** Madara rows: <h5>Label</h5>… <div class="summary-content">value</div> */
function metaRow(html: string, label: string): string {
  const re = new RegExp(
    `summary-heading">\\s*<h5[^>]*>\\s*${label}\\s*</h5>[\\s\\S]{0,400}?summary-content[^>]*>([\\s\\S]{0,500}?)</div>`,
    'i'
  );
  return stripTags(html.match(re)?.[1] || '');
}

function mrStatus(status: string): string {
  const s = status.toLowerCase();
  if (s.startsWith('ongoing') || s.startsWith('on going')) return 'ongoing';
  if (s.startsWith('complete')) return 'completed';
  if (s.includes('hiatus')) return 'hiatus';
  if (s.includes('drop') || s.includes('cancel')) return 'cancelled';
  return 'unknown';
}

function mrOrigin(type: string): MangaItem['origin'] {
  const t = type.toLowerCase();
  if (t === 'manhwa') return 'kr';
  if (t === 'manhua') return 'cn';
  if (t === 'manga' || t === 'japanese') return 'jp';
  return 'other';
}

/** Junk that Madara themes put inside the genre list */
const NON_GENRES = new Set(['completed', 'ongoing', 'hiatus', 'dropped', 'cancelled', 'manhwa', 'manga', 'manhua']);

export async function mrDetail(id: string): Promise<MangaItem> {
  const parsed = parseMrMangaId(id);
  if (!parsed) throw new Error(`Bad MangaRead id: ${id}`);
  return cached(`mr:detail:v1:${id}`, 15 * 60_000, async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 14000);
    let html: string;
    try {
      const res = await fetch(`${MR_BASE}/manga/${parsed.slug}/`, {
        signal: ctrl.signal,
        cache: 'no-store',
        redirect: 'follow',
        headers: MR_HEADERS,
      });
      if (!res.ok) throw new Error(`MangaRead ${res.status}`);
      html = await res.text();
      // Unknown slugs soft-404 by redirecting to the homepage
      if (!res.url.includes(`/manga/${parsed.slug}`)) throw new Error('MangaRead series not found');
    } finally {
      clearTimeout(t);
    }

    const title = stripTags(html.match(/<h1[^>]*>([\s\S]{0,150}?)<\/h1>/)?.[1] || '');
    if (!title) throw new Error('MangaRead series page parse failed');
    const cover = html.match(/property="og:image" content="([^"]+)"/)?.[1] || '';
    const descMatch = html.match(
      /description-summary[\s\S]{0,400}?summary__content[^>]*>([\s\S]{60,4000}?)<\/div>/i
    );

    const item = itemBase(id, title, cover);
    item.description = descMatch ? stripTags(descMatch[1]) : '';
    item.status = mrStatus(metaRow(html, 'Status'));
    item.origin = mrOrigin(metaRow(html, 'Type'));
    const year = parseInt(metaRow(html, 'Release') || '', 10);
    if (Number.isFinite(year) && year > 1900) item.year = year;
    const genreBlock = html.match(
      /summary-heading">\s*<h5[^>]*>\s*Genre(?:s|\(s\))?\s*<\/h5>[\s\S]{0,400}?summary-content[^>]*>([\s\S]{0,900}?)<\/div>/i
    )?.[1] || '';
    item.tags = Array.from(genreBlock.matchAll(/<a[^>]*>([^<]+)<\/a>/g))
      .map((g) => stripTags(g[1]))
      .filter((g) => g && !NON_GENRES.has(g.toLowerCase()))
      .slice(0, 12);
    const authorBlock = html.match(
      /summary-heading">\s*<h5[^>]*>\s*Author\(s\)\s*<\/h5>[\s\S]{0,400}?summary-content[^>]*>([\s\S]{0,500}?)<\/div>/i
    )?.[1] || '';
    item.authors = Array.from(authorBlock.matchAll(/<a[^>]*>([^<]+)<\/a>/g))
      .map((a) => stripTags(a[1]))
      .filter(Boolean)
      .slice(0, 4);
    return item;
  });
}

// ── Chapter list (inline on the series page) ─────────────────────────────────

export async function mrChapters(id: string): Promise<MangaChapter[]> {
  const parsed = parseMrMangaId(id);
  if (!parsed) throw new Error(`Bad MangaRead id: ${id}`);
  return cached(`mr:feed:v1:${id}`, 10 * 60_000, async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 14000);
    let html: string;
    try {
      const res = await fetch(`${MR_BASE}/manga/${parsed.slug}/`, {
        signal: ctrl.signal,
        cache: 'no-store',
        redirect: 'follow',
        headers: MR_HEADERS,
      });
      if (!res.ok) throw new Error(`MangaRead ${res.status}`);
      html = await res.text();
      if (!res.url.includes(`/manga/${parsed.slug}`)) throw new Error('MangaRead series not found');
    } finally {
      clearTimeout(t);
    }

    const out: MangaChapter[] = [];
    const seen = new Set<string>();
    const re = new RegExp(
      `href="https://www\\.mangaread\\.org/manga/${parsed.slug}/(chapter-[0-9][0-9.a-z-]*)/?[\\s\\S]{0,600}?chapter-release-date([\\s\\S]{0,300}?)</li>`,
      'gi'
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const [, tail] = m;
      const numMatch = tail.match(/^chapter-([0-9]+(?:[.-]\d+)*)/i);
      if (!numMatch) continue;
      const number = numMatch[1].replace(/-(\d+)$/g, '.$1');
      if (seen.has(number)) continue;
      seen.add(number);
      // release date text — absolute dates parse, relative ("2 years ago") → 0
      const dateText = stripTags(m[2] || '').replace(/^[\s\S]{0,120}?(\d{4}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2}, \d{4}).*$/, '$1');
      const at = dateText ? Date.parse(dateText) || 0 : 0;
      out.push({ id: `mrc:manga/${parsed.slug}/${m[1].replace(/\/$/, '')}`, number, pages: 0, at, source: 'mangaread' });
    }
    // newest-first, numerically enforced
    return out.sort((a, b) => (parseFloat(b.number) || 0) - (parseFloat(a.number) || 0));
  });
}

// ── Step 3: chapter page → page images ──────────────────────────────────────

export async function mrPages(chapterId: string): Promise<string[]> {
  const parsed = parseMrChapterId(chapterId);
  if (!parsed) throw new Error('Bad MangaRead chapter id');
  // Uploaded page paths are permanent — cache generously
  return cached(`mr:pages:v1:${parsed.path}`, 30 * 60_000, async () => {
    const html = await mrFetchHtml(`${MR_BASE}/${parsed.path}/`);
    const pages: string[] = [];
    // img src values contain raw newlines/indentation — whitespace-tolerant
    const imgRe = /<img[^>]*wp-manga-chapter-img[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(html))) {
      const src = m[0].match(/src="\s*(https:[^"\s]+?)\s*"/)?.[1];
      if (src) pages.push(src);
    }
    return pages;
  });
}
