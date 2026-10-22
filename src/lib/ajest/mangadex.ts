// ── MangaDex upstream — server-side helpers for the manga/manhwa tier ───────
// api.mangadex.org is a free public API (no key). Covers + pages hotlink
// from uploads.mangadex.org. We rate-limit ourselves (sequential rails with
// gaps) and cache aggressively, well under their 5 req/s guideline.

import { cached } from './upstream';
import type { MangaChapter, MangaItem } from './types';

const MD = 'https://api.mangadex.org';
const UA = 'Ajest/1.0 (anime+manga web app; https://github.com/zhaliejx/Web-server)';

interface MdManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles: Record<string, string>[];
    description: Record<string, string>;
    originalLanguage?: string;
    status?: string;
    year?: number | null;
    lastChapter?: string | null;
    contentRating?: string;
    tags?: { attributes: { name: Record<string, string> } }[];
  };
  relationships?: { id: string; type: string; attributes?: { fileName?: string; name?: string } }[];
}

interface MdChapter {
  id: string;
  attributes: {
    chapter: string | null;
    title: string | null;
    pages: number;
    publishAt: string;
    readableAt: string;
    externalUrl?: string | null;
    translatedLanguage?: string;
  };
  relationships?: { id: string; type: string; attributes?: { name?: string } }[];
}

export const HEADERS = { 'User-Agent': UA, Accept: 'application/json' };

/** Query builder with repeated-key array support (MangaDex uses ?x[]=a&x[]=b) */
function mdParams(extra: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  const append = (k: string, v: string | string[] | undefined) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.append(k, v);
  };
  append('includes[]', 'cover_art');
  append('contentRating[]', ['safe', 'suggestive', 'erotica']);
  for (const [k, v] of Object.entries(extra)) append(k, v);
  return p;
}

async function mdJson<T>(path: string, params?: URLSearchParams): Promise<T> {
  const r = await fetch(`${MD}${path}${params ? `?${params}` : ''}`, {
    headers: HEADERS,
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`MangaDex ${r.status} ${path}`);
  return r.json() as Promise<T>;
}

/** Normalize a MangaDex manga entity into Ajest's MangaItem */
export function toMangaItem(m: MdManga): MangaItem {
  const a = m.attributes;
  const title =
    a.title?.en ||
    a.altTitles?.find((t) => t.en)?.en ||
    Object.values(a.title || {})[0] ||
    a.altTitles?.[0]?.en ||
    'Untitled';
  const desc = a.description?.en || Object.values(a.description || {}).find(Boolean) || '';
  const coverRel = m.relationships?.find((r) => r.type === 'cover_art');
  const file = coverRel?.attributes?.fileName;
  const origin = (['jp', 'kr', 'cn'] as const).includes(a.originalLanguage as 'jp')
    ? (a.originalLanguage as 'jp' | 'kr' | 'cn')
    : 'other';
  return {
    id: m.id,
    title,
    cover: file ? `https://uploads.mangadex.org/covers/${m.id}/${file}.512.jpg` : '',
    description: desc,
    status: a.status || 'unknown',
    year: a.year ?? undefined,
    contentRating: a.contentRating || 'safe',
    tags: (a.tags || []).map((t) => t.attributes.name.en || Object.values(t.attributes.name)[0]).filter(Boolean),
    origin,
    lastChapter: a.lastChapter || undefined,
  };
}

/** List manga with Ajest's standard filters (EN chapters available, non-adult) */
export async function mangaList(
  extra: Record<string, string | string[] | undefined>,
  limit = 20
): Promise<MangaItem[]> {
  const params = mdParams({
    limit: String(limit),
    'availableTranslatedLanguage[]': 'en',
    hasAvailableChapters: 'true',
    ...extra,
  });
  const j = await mdJson<{ data: MdManga[] }>('/manga', params);
  return (j.data || []).map(toMangaItem);
}

/** Tag-name → UUID lookup (Action/Romance/... rails), cached for a day */
export async function mangaTagUuids(names: string[]): Promise<Record<string, string>> {
  const all = await cached('md:tags:v2', 24 * 3600_000, async () => {
    const j = await mdJson<{ data: { id: string; attributes: { name: Record<string, string> } }[] }>(
      '/manga/tag'
    );
    const map: Record<string, string> = {};
    for (const t of j.data || []) {
      const name = (t.attributes.name.en || '').toLowerCase();
      if (name) map[name] = t.id;
    }
    return map;
  });
  const out: Record<string, string> = {};
  for (const n of names) {
    const id = all[n.toLowerCase()];
    if (id) out[n] = id;
  }
  return out;
}

/**
 * English chapter feed — paginated (100/page, up to 500), external-link
 * chapters skipped (unreadable in-app), deduped by chapter number.
 * Returned newest-first.
 */
export async function mangaFeed(mangaId: string): Promise<MangaChapter[]> {
  const seen = new Set<string>();
  const out: MangaChapter[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const params = mdParams({
      'translatedLanguage[]': 'en',
      'order[chapter]': 'desc',
      limit: '100',
      offset: String(offset),
    });
    const j = await mdJson<{ data: MdChapter[] }>(`/manga/${mangaId}/feed`, params);
    for (const c of j.data || []) {
      const a = c.attributes;
      if (a.externalUrl) continue; // off-site chapter — reader can't open it
      const num = (a.chapter ?? '').trim();
      if (!num) continue; // no-number entries (novels, extras) are unreadable as chapters
      if (seen.has(num)) continue;
      seen.add(num);
      const group = c.relationships?.find((r) => r.type === 'scanlation_group')?.attributes?.name;
      out.push({
        id: c.id,
        number: num,
        title: a.title?.trim() || undefined,
        pages: a.pages || 0,
        at: new Date(a.readableAt || a.publishAt).getTime() || 0,
        group: group || undefined,
      });
    }
    if ((j.data || []).length < 100) break;
  }
  return out;
}

/** Full detail — manga + authors/artists + community statistics */
export async function mangaDetail(id: string): Promise<MangaItem> {
  const params = mdParams({ 'includes[]': ['cover_art', 'author', 'artist'] });
  const j = await mdJson<{ data: MdManga }>(`/manga/${id}`, params);
  const item = toMangaItem(j.data);
  const authors = (j.data.relationships || [])
    .filter((r) => r.type === 'author' || r.type === 'artist')
    .map((r) => r.attributes?.name)
    .filter(Boolean) as string[];
  item.authors = [...new Set(authors)].slice(0, 4);
  try {
    const s = await mdJson<{
      statistics?: Record<string, { rating?: { bayesian?: number }; follows?: number }>;
    }>(`/statistics/manga/${id}`);
    const stat = s?.statistics?.[id];
    if (stat?.rating?.bayesian) item.rating = Math.round(stat.rating.bayesian * 10) / 10;
    if (typeof stat?.follows === 'number') item.follows = stat.follows;
  } catch {
    /* statistics are optional garnish */
  }
  return item;
}
