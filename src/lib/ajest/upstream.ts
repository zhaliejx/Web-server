// ── Server-only helpers for upstream anime APIs ─────────────────────────────
// Triple-fallback data fabric (all tiers verified live against the network):
//   Tier 1: AniList GraphQL   (https://graphql.anilist.co)
//   Tier 2: Kitsu JSON:API    (https://kitsu.io/api/edge)
//   Tier 3: Gogoanime mirror  (https://gogoanime.by — direct scrape, see gogo.ts)
// Episode metadata: ani.zip mappings (https://api.ani.zip)
// Stream relay assist: self-hosted Anime-API fork (port 3002) + community
// vercel instances — search-only

import type { AnimeCard, EpisodeMeta, OfficialLink } from './types';

export const ANILIST_URL = 'https://graphql.anilist.co';
export const KITSU_URL = 'https://kitsu.io/api/edge';
export const ANIZIP_URL = 'https://api.ani.zip/mappings';
export const GOGO_BASE = 'https://gogoanime.by';

// Relay search assist — Anime-API deployments exposing /gogoanime/search.
// Tried when the direct site search fails. Order matters only for the health
// probe (first healthy host wins); search calls race ALL hosts in parallel.
//   127.0.0.1:3002 — SELF-HOSTED fork running alongside Ajest (mini-services/
//                    anime-api). Fastest + freshest: targets gogoanime.is
//                    directly (~1s live scrapes, 1h server cache), plus serves
//                    /mangadex, /crunchyroll, /animepahe, /animekai endpoints.
//   api-ajest.onrender.com — user's Render deployment of the same fork
//                    (persistent Node server, warm cache; free tier sleeps
//                    after ~15 min idle — a sleeping node just loses the
//                    race, wakes on the next request, and wins later ones)
//   api-ajest      — user's vercel deployment (search+info, 1h cache; fresh
//                    uncached scrapes can hang, so the caller uses a short
//                    per-host timeout — cache-misses are abandoned)
//   api-anime-rouge — original community relay (intermittent)
// Deployments can override the chain via RELAY_HOSTS (comma-separated).
// e.g. a Render-deployed web app would set:
//   RELAY_HOSTS=https://api-ajest.onrender.com
// (localhost entries from another host fail fast — connection refused — so
// the defaults are safe anywhere; the override just skips the dead hop)
export const RELAY_HOSTS = process.env.RELAY_HOSTS?.split(',')
  .map((s) => s.trim())
  .filter(Boolean) ?? [
  'http://127.0.0.1:3002',
  'https://api-ajest.onrender.com',
  'https://api-ajest.vercel.app',
  'https://api-anime-rouge.vercel.app',
];

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 9000
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Ajest/1.0 (+anime-streaming)',
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      let body = '';
      try {
        body = (await res.text()).slice(0, 160);
      } catch {
        /* body unreadable */
      }
      throw new Error(`HTTP ${res.status} from ${url}${body ? ` — ${body}` : ''}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

// ── Tiny in-memory TTL cache (reduces upstream rate-limit pressure) ─────────
const memCache = new Map<string, { at: number; data: unknown }>();
const memInflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.data as T;
  const inflight = memInflight.get(key);
  if (inflight) return inflight as Promise<T>;
  const p = (async () => {
    try {
      const data = await fn();
      memCache.set(key, { at: Date.now(), data });
      return data;
    } finally {
      memInflight.delete(key);
    }
  })();
  memInflight.set(key, p);
  return p;
}

// ── AniList GraphQL ─────────────────────────────────────────────────────────
export const ANILIST_CARD_FIELDS = `
  id
  idMal
  title { romaji english native }
  coverImage { extraLarge large color }
  bannerImage
  averageScore
  format
  episodes
  duration
  season
  seasonYear
  status
  genres
  description(asHtml: false)
  studios(isMain: true) { nodes { name } }
`;

export interface AniListRaw {
  id: number;
  idMal: number | null;
  title: { romaji?: string; english?: string | null; native?: string | null };
  coverImage: { extraLarge?: string; large?: string; color?: string };
  bannerImage?: string | null;
  averageScore?: number | null;
  format?: string | null;
  episodes?: number | null;
  duration?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  status?: string | null;
  genres?: string[];
  description?: string | null;
  studios?: { nodes: { name: string }[] };
}

export function anilistCard(m: AniListRaw): AnimeCard {
  return {
    id: `anilist:${m.id}`,
    anilistId: m.id,
    malId: m.idMal ?? undefined,
    title: m.title.english || m.title.romaji || m.title.native || 'Untitled',
    titleEnglish: m.title.english ?? undefined,
    titleRomaji: m.title.romaji ?? undefined,
    titleNative: m.title.native ?? undefined,
    cover: m.coverImage.extraLarge || m.coverImage.large || '',
    banner: m.bannerImage ?? undefined,
    color: m.coverImage.color ?? undefined,
    score: m.averageScore ?? undefined,
    format: m.format ?? undefined,
    episodes: m.episodes ?? undefined,
    duration: m.duration ?? undefined, // ← exact minutes per episode from AniList
    season: m.season ?? undefined,
    seasonYear: m.seasonYear ?? undefined,
    status: m.status ?? undefined,
    genres: m.genres ?? [],
    studio: m.studios?.nodes?.[0]?.name,
    description: m.description?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
    source: 'anilist',
  };
}

export async function anilistQuery<T>(query: string, variables: Record<string, unknown>, timeoutMs = 9000): Promise<T> {
  const data = await fetchJson<{ data: T }>(
    ANILIST_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    },
    timeoutMs
  );
  if (!data?.data) throw new Error('AniList returned no data');
  return data.data;
}

// ── Kitsu JSON:API ──────────────────────────────────────────────────────────
interface KitsuRaw {
  id: string;
  attributes: {
    canonicalTitle?: string;
    titles?: Record<string, string>;
    slug?: string;
    subtype?: string;
    status?: string;
    episodeCount?: number | null;
    episodeLength?: number | null;
    averageRating?: string | null;
    startDate?: string | null;
    posterImage?: { tiny?: string; small?: string; medium?: string; large?: string; original?: string };
    coverImage?: { tiny?: string; small?: string; medium?: string; large?: string; original?: string; meta?: unknown };
    synopsis?: string | null;
    season?: string | null;
    userCount?: number | null;
    ageRating?: string | null;
  };
}

export function kitsuCard(a: KitsuRaw): AnimeCard {
  const t = a.attributes.titles || {};
  const statusMap: Record<string, string> = {
    current: 'RELEASING',
    finished: 'FINISHED',
    upcoming: 'NOT_YET_RELEASED',
    tba: 'NOT_YET_RELEASED',
    unreleased: 'NOT_YET_RELEASED',
  };
  const seasonMap: Record<string, string> = {
    winter: 'WINTER',
    spring: 'SPRING',
    summer: 'SUMMER',
    fall: 'FALL',
  };
  const startYear = a.attributes.startDate ? parseInt(a.attributes.startDate.slice(0, 4), 10) : undefined;
  return {
    id: `kitsu:${a.id}`,
    title:
      t.en ||
      t.en_us ||
      a.attributes.canonicalTitle ||
      t.en_jp ||
      'Untitled',
    titleEnglish: t.en || t.en_us || a.attributes.canonicalTitle || undefined,
    titleRomaji: t.en_jp || undefined,
    titleNative: t.ja_jp || undefined,
    cover:
      a.attributes.posterImage?.large ||
      a.attributes.posterImage?.medium ||
      a.attributes.posterImage?.original ||
      a.attributes.posterImage?.small ||
      '',
    banner: a.attributes.coverImage?.large || a.attributes.coverImage?.original || undefined,
    score: a.attributes.averageRating ? Math.round(parseFloat(a.attributes.averageRating)) : undefined,
    format: (a.attributes.subtype || '').toUpperCase() || undefined,
    episodes: a.attributes.episodeCount ?? undefined,
    duration: a.attributes.episodeLength ?? undefined, // ← exact minutes from Kitsu
    season: a.attributes.season ? seasonMap[a.attributes.season] : undefined,
    seasonYear: startYear,
    status: statusMap[a.attributes.status || ''] || undefined,
    studio: undefined,
    description: stripHtml(a.attributes.synopsis),
    source: 'kitsu',
  };
}

// Kitsu hard-caps page[limit] at 20 on collection endpoints (400 otherwise)
function kitsuLimit(n: number): number {
  return Math.max(1, Math.min(20, Math.floor(n)));
}

async function kitsuFetch(path: string, timeoutMs = 9000): Promise<KitsuRaw[]> {
  // Kitsu rejects non-browser User-Agents with 406, and its edge API requires
  // percent-encoded query brackets ([ → %5B, ] → %5D) — fetch sends them raw.
  const encoded = path.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
  const d = await fetchJson<{ data?: KitsuRaw[] }>(`${KITSU_URL}${encoded}`, {
    headers: {
      // Kitsu 406s unless the request looks browser-ish AND accepts JSON:API
      Accept: 'application/vnd.api+json, application/json, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  }, timeoutMs);
  return d.data || [];
}

export async function kitsuTrending(limit = 20): Promise<AnimeCard[]> {
  const rows = await kitsuFetch(`/trending/anime?limit=${limit}`);
  return rows.map(kitsuCard);
}

export async function kitsuSeasonal(season: string, year: number, limit = 20, upcoming = false): Promise<AnimeCard[]> {
  const sort = upcoming ? '-startDate' : '-userCount';
  const rows = await kitsuFetch(
    `/anime?filter[season]=${season.toLowerCase()}&filter[seasonYear]=${year}&sort=${sort}&page[limit]=${kitsuLimit(limit)}`
  );
  return rows.map(kitsuCard);
}

export async function kitsuPopular(limit = 20): Promise<AnimeCard[]> {
  const rows = await kitsuFetch(`/anime?sort=-userCount&page[limit]=${kitsuLimit(limit)}`);
  return rows.map(kitsuCard);
}

export async function kitsuSearch(q: string, limit = 20): Promise<AnimeCard[]> {
  const rows = await kitsuFetch(
    `/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=${kitsuLimit(limit)}`
  );
  return rows.map(kitsuCard);
}

/** Genre row (Kitsu categories: action, fantasy, romance, …) */
export async function kitsuByCategory(category: string, limit = 20): Promise<AnimeCard[]> {
  const rows = await kitsuFetch(
    `/anime?filter[categories]=${encodeURIComponent(category)}&sort=-userCount&page[limit]=${kitsuLimit(limit)}`
  );
  return rows.map(kitsuCard);
}

export async function kitsuById(id: number): Promise<AnimeCard> {
  const rows = await kitsuFetch(`/anime?filter[id]=${id}`);
  if (!rows.length) throw new Error(`kitsu ${id} not found`);
  return kitsuCard(rows[0]);
}

// ── ani.zip episode mappings (per-episode titles, runtime, thumbnails) ──────
export interface AniZipEpisode {
  number: number;
  title?: string;
  runtimeMin?: number;
  thumbnail?: string;
  airDateUtc?: string;
  /** TVDB/TMDB season this episode belongs to (universal embed mapping) */
  seasonNumber?: number;
}

export interface AniZipData {
  mappings: Record<string, string | number | null>;
  episodeCount?: number;
  episodes: AniZipEpisode[];
  /** TMDB id (mappings.themoviedb_id) — addresses the universal embed player */
  tmdbId?: number;
}

interface AniZipRawEpisode {
  episodeNumber?: number;
  seasonNumber?: number;
  title?: Record<string, string>;
  runtime?: number;
  image?: string;
  airDateUtc?: string;
}

export async function aniZip(query: {
  anilistId?: number;
  malId?: number;
  kitsuId?: number;
}): Promise<AniZipData | null> {
  const param = query.anilistId
    ? `anilist_id=${query.anilistId}`
    : query.malId
      ? `mal_id=${query.malId}`
      : query.kitsuId
        ? `kitsu_id=${query.kitsuId}`
        : null;
  if (!param) return null;
  try {
    const d = await fetchJson<{
      titles?: Record<string, string>;
      episodes?: Record<string, AniZipRawEpisode>;
      episodeCount?: number;
      mappings?: Record<string, string | number | null>;
    }>(`${ANIZIP_URL}?${param}`, {}, 8000);
    const eps: AniZipEpisode[] = Object.entries(d.episodes || {})
      // Only plain-number keys ("1".."28") are canonical episodes — "S1"/"SP1"
      // keys are specials whose episodeNumber collides with the main list.
      .filter(([k]) => /^\d+$/.test(k))
      .map(([k, e]) => ({
        number: (e.episodeNumber ?? parseInt(k, 10)) || 0,
        title: e.title?.en || e.title?.['x-jat'] || undefined,
        runtimeMin: e.runtime ?? undefined,
        thumbnail: e.image || undefined,
        airDateUtc: e.airDateUtc || undefined,
        seasonNumber: e.seasonNumber ?? undefined,
      }))
      .filter((e) => e.number > 0)
      .sort((a, b) => a.number - b.number);
    const rawTmdb = d.mappings?.themoviedb_id;
    return {
      mappings: d.mappings || {},
      episodeCount: d.episodeCount,
      episodes: eps,
      tmdbId: rawTmdb ? parseInt(String(rawTmdb), 10) || undefined : undefined,
    };
  } catch {
    return null;
  }
}

/** Enrich episode metadata from ani.zip per-episode runtime + titles + thumbnails */
export function mergeAniZipEpisodes(base: EpisodeMeta[], zip: AniZipData | null): EpisodeMeta[] {
  if (!zip?.episodes.length) return base;
  const byNum = new Map(zip.episodes.map((e) => [e.number, e]));
  return base.map((e) => {
    const z = byNum.get(e.number);
    if (!z) return e;
    return {
      ...e,
      title: z.title || e.title,
      durationMin: z.runtimeMin || e.durationMin, // ← exact per-episode runtime
      thumbnail: z.thumbnail || e.thumbnail,
      airDate: z.airDateUtc?.slice(0, 10) || e.airDate,
    };
  });
}

// ── MALSync — official streaming destination mapping (verified live) ────────
// api.malsync.moe maps AniList/MAL ids → official sites (Crunchyroll, Hulu,
// KickAssAnime…). All inputs verified against the live API.
interface MalSyncSiteEntry {
  title?: string;
  url?: string;
}

export async function malSyncOfficialLinks(ids: {
  anilistId?: number;
  malId?: number;
}): Promise<OfficialLink[]> {
  if (!ids.anilistId && !ids.malId) return [];
  const key = ids.anilistId ? `anilist:${ids.anilistId}` : `mal:${ids.malId}`;
  try {
    const d = await cached(`malsync:${key}`, 60 * 60_000, async () =>
      fetchJson<{
        Sites?: Record<string, Record<string, MalSyncSiteEntry>>;
      }>(`https://api.malsync.moe/mal/anime/${encodeURIComponent(key)}`, {}, 8000)
    );
    const sites = d?.Sites || {};
    const out: OfficialLink[] = [];
    for (const [site, entries] of Object.entries(sites)) {
      for (const entry of Object.values(entries || {})) {
        if (entry?.url && /^https?:\/\//.test(entry.url)) {
          out.push({ site, url: entry.url });
          break; // one link per site
        }
      }
    }
    return out.slice(0, 6);
  } catch {
    return [];
  }
}

// ── YouTube search (real, keyless — ytInitialData scrape) ───────────────────
// Used ONLY for officially-uploaded full episodes / trailers (Muse Asia,
// Ani-One, Crunchyroll channels). Returns real videoIds for legal embedding.
export interface YtVideo {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
}

interface YtRenderer {
  videoId?: string;
  title?: { runs?: { text?: string }[] };
  ownerText?: { runs?: { text?: string }[] };
  lengthText?: { simpleText?: string };
}

function parseYtDuration(s?: string): number {
  if (!s) return 0;
  const parts = s.split(':').map((p) => parseInt(p, 10) || 0);
  if (!parts.length) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export async function youtubeSearch(query: string, timeoutMs = 10000): Promise<YtVideo[]> {
  return cached(`yt:${query.toLowerCase()}`, 30 * 60_000, async () => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`; // videos only
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from youtube`);
      const html = await res.text();
      // [\s\S] instead of the es2018 's' (dotAll) flag — same semantics, wider target support
      const m = html.match(/ytInitialData\s*=\s*(\{[\s\S]+?\});\s*<\/script>/);
      if (!m) return [];
      const data = JSON.parse(m[1]) as unknown;
      const out: YtVideo[] = [];
      const walk = (o: unknown) => {
        if (Array.isArray(o)) {
          o.forEach(walk);
          return;
        }
        if (o && typeof o === 'object') {
          const r = o as Record<string, unknown>;
          if (r.videoRenderer) {
            const v = r.videoRenderer as YtRenderer;
            if (v.videoId) {
              out.push({
                videoId: v.videoId,
                title: (v.title?.runs || []).map((x) => x.text || '').join(''),
                channel: (v.ownerText?.runs || []).map((x) => x.text || '').join(''),
                durationSec: parseYtDuration(v.lengthText?.simpleText),
              });
            }
          }
          Object.values(r).forEach(walk);
        }
      };
      walk(data);
      return out;
    } finally {
      clearTimeout(t);
    }
  });
}

const OFFICIAL_CHANNELS = [
  'muse asia', 'muse木棉花', 'muse africa', 'ani-one', 'anione', 'ani one',
  'crunchyroll collection', 'crunchyroll', 'netflix anime', 'aniplex',
  'toei animation', 'viz media', 'gkids', 'sentai',
];

/** Rank YouTube results for a full-episode upload; null when none qualify.
 *  `official` is true only for verified publisher channels (Muse Asia, Ani-One,
 *  Crunchyroll…) — everything else is labeled honestly as a community upload. */
export function rankYoutubeEpisode(
  videos: YtVideo[],
  title: string,
  ep: number
): { video: YtVideo; official: boolean } | null {
  const t = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tok = t.split(' ').filter((w) => w.length > 2);
  let bestOfficial: { v: YtVideo; score: number } | null = null;
  let bestCommunity: { v: YtVideo; score: number } | null = null;
  for (const v of videos) {
    const title = v.title.toLowerCase();
    const ch = v.channel.toLowerCase();
    const official = OFFICIAL_CHANNELS.some((o) => ch.includes(o));
    let score = 0;
    if (official) score += 120;
    if (new RegExp(`(episode|ep|eps?)\\s*\\.?\\s*0*${ep}\\b`).test(title)) score += 50;
    if (v.durationSec >= 14 * 60) score += 30;
    else if (v.durationSec > 0 && v.durationSec < 90) score -= 90;
    if (/\b(clip|edit|amv|reaction|recap|shorts|opening|ending|review|explain)\b/.test(title)) score -= 70;
    if (/\b(english sub|eng sub|subbed|esub|multi sub)\b/.test(title)) score += 15;
    // Title relevance: overlap with anime title tokens
    const overlap = tok.filter((w) => title.includes(w)).length;
    if (tok.length) score += Math.round((overlap / tok.length) * 40);
    // Community uploads must clear a much higher bar (episode match + length)
    const threshold = official ? 100 : 150;
    if (score >= threshold) {
      const slot = official ? bestOfficial : bestCommunity;
      if (!slot || score > slot.score) {
        if (official) bestOfficial = { v, score };
        else bestCommunity = { v, score };
      }
    }
  }
  if (bestOfficial) return { video: bestOfficial.v, official: true };
  if (bestCommunity) return { video: bestCommunity.v, official: false };
  return null;
}

/** Best official trailer (or PV) — official channels only, clearly labeled */
export function rankYoutubeTrailer(videos: YtVideo[]): YtVideo | null {
  for (const v of videos) {
    const title = v.title.toLowerCase();
    const ch = v.channel.toLowerCase();
    if (/\b(trailer|pv|preview|teaser)\b/.test(title) && !/\b(reaction|review|explain)\b/.test(title)) {
      if (OFFICIAL_CHANNELS.some((o) => ch.includes(o))) return v;
    }
  }
  return null;
}

// ── Drama-side YouTube ranking ──────────────────────────────────────────────
// Drama full episodes live on official broadcaster / licensor channels —
// notably Viki Global TV (Rakuten Viki's own uploads), KBS World, iQiyi,
// WeTV/Tencent, Viu and Netflix Philippines. Viki's own site serves every
// episode Widevine-DRM'd (dt2_dt3 manifests, no embeddable player), so their
// YouTube channel is the only legitimate way to bring "Viki content" into the
// native player — ad-light, zero server bandwidth, own controls.
export const DRAMA_OFFICIAL_CHANNELS = [
  'viki global tv', 'rakuten viki', 'kbs world', 'kbs drama',
  'iqiyi', 'wetv', 'tencent video', 'viu', 'netflix',
  'astro', 'gma network', 'abs-cbn', 'jtbc', 'sbs drama', 'mbc drama', 'tvn d',
];

/** Rank YouTube results for a DRAMA full-episode upload; null when none
 *  qualify. Same scoring shape as the anime ranker, tuned for dramas:
 *  20-100 min runtimes, "eng sub" naming conventions, highlight/shorts junk. */
export function rankYoutubeDramaEpisode(
  videos: YtVideo[],
  title: string,
  ep: number
): { video: YtVideo; official: boolean } | null {
  const t = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tok = t.split(' ').filter((w) => w.length > 2);
  let bestOfficial: { v: YtVideo; score: number } | null = null;
  let bestCommunity: { v: YtVideo; score: number } | null = null;
  for (const v of videos) {
    const title = v.title.toLowerCase();
    const ch = v.channel.toLowerCase();
    const official = DRAMA_OFFICIAL_CHANNELS.some((o) => ch.includes(o.toLowerCase()));
    let score = 0;
    if (official) score += 120;
    // Episode number — dramas write "Episode 5", "EP 5", "Ep 5", "[Ep 5]"
    if (new RegExp(`(episode|ep|eps?)\\s*\\.?\\s*0*${ep}\\b`).test(title)) score += 50;
    if (new RegExp(`\\b0*${ep}\\b`).test(title)) score += 15;
    // K-dramas run 45-90 min; C-dramas 20-50. Anything ≥ 20 min is episode-ish
    if (v.durationSec >= 20 * 60) score += 30;
    else if (v.durationSec > 0 && v.durationSec < 10 * 60) score -= 90;
    if (/\b(clip|edit|amv|reaction|recap|shorts|teaser|highlight|mv|ost|review|explain|top\s*10)\b/.test(title)) score -= 70;
    if (/\b(english sub|eng sub|subbed|esub|multi sub|free episode|full episode|full)\b/.test(title)) score += 15;
    // Title relevance: overlap with drama title tokens
    const overlap = tok.filter((w) => title.includes(w)).length;
    if (tok.length) score += Math.round((overlap / tok.length) * 40);
    // Community uploads must clear a much higher bar (episode match + length)
    const threshold = official ? 100 : 150;
    if (score >= threshold) {
      const slot = official ? bestOfficial : bestCommunity;
      if (!slot || score > slot.score) {
        if (official) bestOfficial = { v, score };
        else bestCommunity = { v, score };
      }
    }
  }
  if (bestOfficial) return { video: bestOfficial.v, official: true };
  if (bestCommunity) return { video: bestCommunity.v, official: false };
  return null;
}

// ── Rakuten Viki title bridge ────────────────────────────────────────────────
// Viki's site serves every full episode as Widevine/PlayReady DRM DASH
// (dt2_dt3 manifests via manifest-viki.viki.io) and hard-blocks framing
// (x-frame-options: SAMEORIGIN everywhere, /player/<id> route is 404) — so
// their catalog cannot play inside Ajest and cannot be ad-stripped without
// defeating their free tier's model, which we won't do. What IS possible:
// verify a title exists on Viki (their legacy v4 search needs no signature)
// and hand the user a one-tap official link. Matching is strict — the legacy
// index is weak on modern English titles, so only confident matches surface.
export interface VikiMatch {
  title: string;
  /** Full web URL, e.g. https://www.viki.com/tv/38805c-a-romance-of-the-little-forest */
  url: string;
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Search Viki and return a confident title match (or null). Cached 6 h. */
export function vikiTitleSearch(title: string, timeoutMs = 7000): Promise<VikiMatch | null> {
  const q = title.trim();
  if (!q) return Promise.resolve(null);
  return cached(`viki:${normTitle(q)}`, 6 * 60 * 60_000, async () => {
    const url = `https://api.viki.io/v4/search.json?c=${encodeURIComponent(q)}&app=100000a&per_page=20`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        cache: 'no-store',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        },
      });
      if (!res.ok) return null;
      const rows = (await res.json()) as {
        id?: string;
        tt?: string; // English title
        tf?: string; // full/original title
        t?: string; // type — series|movie
        u?: { w?: string }; // web path
        blocking?: { geo?: boolean; paywall?: boolean; upcoming?: boolean };
      }[];
      if (!Array.isArray(rows)) return null;
      const target = normTitle(q);
      const targetTok = new Set(target.split(' ').filter(Boolean));
      let best: { row: (typeof rows)[number]; score: number } | null = null;
      for (const row of rows) {
        if (!row?.u?.w || row.blocking?.upcoming) continue;
        for (const cand of [row.tt, row.tf]) {
          if (!cand) continue;
          const c = normTitle(cand);
          if (c === target) {
            if (!best || best.score < 100) best = { row, score: 100 };
            break;
          }
          // Token overlap — every meaningful token of one title appears in the other
          const candTok = c.split(' ').filter(Boolean);
          if (!candTok.length || !targetTok.size) continue;
          const hit = candTok.filter((w) => targetTok.has(w)).length;
          const ratio = hit / Math.max(candTok.length, targetTok.size);
          const score = Math.round(ratio * 90);
          if (score >= 75 && (!best || score > best.score)) best = { row, score };
          if (cand === row.tf) break;
        }
      }
      if (!best) return null;
      return { title: best.row.tt || best.row.tf || q, url: `https://www.viki.com${best.row.u.w}` };
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  });
}

// ── Rouge relay (community Anime-API) — search assist ───────────────────
export interface RougeResult {
  id: string;
  name: string;
  img?: string;
  releasedYear?: string;
}

/** Relay-friendly keyword: lowercase alnum tokens, no punctuation/quotes
 *  (punctuation-heavy queries make the deployment's scraper hang). */
export function sanitizeRelayKeyword(q: string): string {
  return q
    .replace(/[''`]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Relay search assist. Fires all (host × keyword) fetches IN PARALLEL —
 *  first non-empty answer wins. Keywords: sanitized full query, then shorter
 *  prefixes (first-2-tokens, first-token) — the deployments cache results per
 *  keyword, so popular short queries are far more likely to be warm than long
 *  multi-word ones. Racing keeps the worst case at one timeout window instead
 *  of a sequential pile-up that would starve later chain steps. */
export async function relayGogoSearch(q: string, timeoutMs = 6000): Promise<RougeResult[]> {
  const kw = sanitizeRelayKeyword(q);
  if (!kw) return [];
  const tokens = kw.split(' ').filter(Boolean);
  const attempts = new Set<string>([kw]);
  if (tokens.length > 2) attempts.add(tokens.slice(0, 2).join(' '));
  if (tokens.length > 1) attempts.add(tokens[0]);

  const jobs: Promise<RougeResult[]>[] = [];
  for (const host of RELAY_HOSTS) {
    for (const attempt of attempts) {
      jobs.push(
        fetchJson<{ animes?: RougeResult[] }>(
          `${host}/gogoanime/search?keyword=${encodeURIComponent(attempt)}&page=1`,
          {},
          timeoutMs
        ).then((d) => {
          if (Array.isArray(d?.animes) && d.animes.length) return d.animes;
          throw new Error(`relay: no results for "${attempt}"`);
        })
      );
    }
  }
  try {
    return await Promise.any(jobs);
  } catch {
    return []; // every window timed out / empty — caller falls through honestly
  }
}

// ── Season helpers ──────────────────────────────────────────────────────────
export function currentSeason(d = new Date()): { season: string; year: number; nextSeason: string; nextYear: number } {
  const m = d.getMonth(); // 0-11
  const year = d.getFullYear();
  const order: [string, number][] = [
    ['WINTER', 0],
    ['SPRING', 1],
    ['SUMMER', 2],
    ['FALL', 3],
  ];
  const idx = m <= 1 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3;
  const cur = order[idx];
  const nxt = order[(idx + 1) % 4];
  const nextYear = idx === 3 ? year + 1 : year;
  return { season: cur[0], year, nextSeason: nxt[0], nextYear };
}

export function stripHtml(s?: string | null): string {
  return (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
