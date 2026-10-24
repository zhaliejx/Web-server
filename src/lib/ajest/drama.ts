// ── Server-only helpers for the drama tier (K-drama / C-drama / Asian TV) ───
// Source: the dramacool9 REST family (dramacool9.rest, mirror dramacool.lat).
//
// The site is an Angular Universal (SSR) app whose backing JSON API
// (api.dramacool.rest/v1/*) sits behind Cloudflare bot-fight — direct calls
// from datacenter IPs get challenged. But every SSR page embeds the API
// responses it fetched in <script id="ng-state"> (Angular transfer-state),
// so the SSR page effectively acts as a Cloudflare-passing proxy:
//   /                        → /v1/home           (7 named catalog sections)
//   /search?q=<q>            → /v1/drama/search   (10 results/page)
//   /explore?<filters>       → /v1/drama/list     (30/page, country/genre/…)
//   /drama/<slug>            → /v1/drama/detail   (metadata + episodes)
//   /drama/<slug>/episode-N  → detail + a pre-resolved direct stream (flaky)
// Streams come from the watch page too: each episode carries a streamUrls[]
// list of hoster embeds (kissasian/dood/vidmoly/streamtape/streamwish…),
// plus — when the SSR worker managed to pre-resolve it — a direct HLS proxy
// URL (hlsproxy-l7-1.asiaflix.in) that must be played from the USER'S browser
// (hls.js), never through our /api/proxy (that would eat the CF challenge).

import type { DramaDetail, DramaEpisode, DramaItem, VideoSource } from './types';
import { youtubeSearch, rankYoutubeDramaEpisode, vikiTitleSearch } from './upstream';

const DC_HOSTS = ['https://dramacool9.rest', 'https://dramacool.rest', 'https://dramacool.lat'];
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** Host cache — first mirror that answers wins; re-probed every 5 min. */
let dcHost: { url: string; at: number } | null = null;

async function dcFetchHtml(path: string, timeoutMs = 15000): Promise<string> {
  const now = Date.now();
  const hosts = dcHost && now - dcHost.at < 5 * 60_000 ? [dcHost.url, ...DC_HOSTS.filter((h) => h !== dcHost!.url)] : DC_HOSTS;
  let lastErr: unknown = null;
  for (const host of hosts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${host}${path}`, {
        signal: ctrl.signal,
        cache: 'no-store',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${host}${path}`);
      const html = await res.text();
      if (html.length < 5000) throw new Error(`${host} returned a stub page`);
      dcHost = { url: host, at: Date.now() };
      return html;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      dcHost = null; // mirror flapped — re-probe next call
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('all drama mirrors failed');
}

// ── ng-state (Angular transfer-state) parsing ────────────────────────────────

interface NgEntry {
  u: string; // backing API url
  b: unknown; // response body
}

export function parseNgState(html: string): Record<string, NgEntry> {
  const m = html.match(/<script id="ng-state" type="application\/json">([\s\S]+?)<\/script>/);
  if (!m) return {};
  try {
    const raw = JSON.parse(m[1]) as Record<string, unknown>;
    const out: Record<string, NgEntry> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === '__nghData__' || !v || typeof v !== 'object') continue;
      const e = v as Record<string, unknown>;
      if (typeof e.u === 'string') out[k] = { u: e.u, b: e.b };
    }
    return out;
  } catch {
    return {};
  }
}

function findEntry(state: Record<string, NgEntry>, path: string): NgEntry | null {
  for (const e of Object.values(state)) {
    try {
      if (new URL(e.u).pathname === path) return e; // exact — '/v1/home' must not match '/v1/home/meta'
    } catch {
      /* relative url — compare raw */
      if (e.u === path) return e;
    }
  }
  return null;
}

// ── Raw → public mappers ─────────────────────────────────────────────────────

interface RawListItem {
  _id?: string;
  name?: string;
  slug?: string;
  normalizedName?: string;
  image?: string;
  coverImage?: string;
  country?: string;
  status?: string;
  releaseYear?: string | number;
}

function mapDramaItem(r: RawListItem): DramaItem | null {
  const slug = r.slug || r.normalizedName || '';
  if (!slug || !r.name) return null;
  return {
    slug,
    title: r.name,
    cover: r.coverImage || r.image || '',
    year: r.releaseYear ? String(r.releaseYear) : undefined,
    country: r.country || undefined,
    status: r.status || undefined,
    siteId: r._id,
    source: 'dramacool',
  };
}

interface RawEpisode {
  epUrl?: string | null;
  number?: number;
  title?: string | null;
  duration?: number | string | null;
  /** Hoster embed list — {source, url, type} */
  streamUrls?: unknown[];
}

/** Legacy epUrl ("…-episode-16-1.html" / "…-episode-8.html") → watch key + number */
function mapEpisode(raw: RawEpisode): DramaEpisode | null {
  const url = raw.epUrl || '';
  const m = url.match(/episode-([0-9]+(?:-[0-9]+)?)/);
  if (!m) return null;
  const number = parseFloat(m[1].replace(/-/g, '.'));
  if (!Number.isFinite(number)) return null;
  const epKey = `episode-${m[1].replace(/-/g, '.')}`;
  const dur = typeof raw.duration === 'string' ? parseInt(raw.duration, 10) : raw.duration;
  return { number, epKey, title: raw.title || undefined, durationMin: dur || undefined };
}

/** Fallback episode list from the series page's SSR hrefs (covers >20-ep shows) */
function episodesFromHrefs(html: string, slug: string): DramaEpisode[] {
  const out = new Map<string, DramaEpisode>();
  const re = new RegExp(`href="/drama/${slug}/(episode-[0-9.]+)"`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const epKey = m[1];
    const number = parseFloat(epKey.replace('episode-', ''));
    if (Number.isFinite(number) && !out.has(epKey)) out.set(epKey, { number, epKey });
  }
  return [...out.values()].sort((a, b) => a.number - b.number);
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Home catalog — /v1/home's named sections embedded in the homepage SSR. */
export async function dramaHome(): Promise<{ sections: { title: string; items: DramaItem[] }[] }> {
  const html = await dcFetchHtml('/');
  const state = parseNgState(html);
  const home = findEntry(state, '/v1/home');
  const raw = (home?.b as { title?: string; data?: RawListItem[] }[] | undefined) || [];
  const sections = raw
    .filter((s) => s && typeof s.title === 'string' && Array.isArray(s.data))
    .map((s) => ({
      title: s.title as string,
      items: (s.data || []).map(mapDramaItem).filter((x): x is DramaItem => !!x),
    }))
    .filter((s) => s.items.length > 0);
  return { sections };
}

/** Search — /v1/drama/search via the /search?q= SSR page. */
export async function dramaSearch(q: string): Promise<DramaItem[]> {
  const html = await dcFetchHtml(`/search?q=${encodeURIComponent(q)}`);
  const state = parseNgState(html);
  const entry = findEntry(state, '/v1/drama/search');
  const body = entry?.b as { body?: RawListItem[] } | RawListItem[] | undefined;
  const list = Array.isArray(body) ? body : body?.body || [];
  return list.map(mapDramaItem).filter((x): x is DramaItem => !!x);
}

interface RawDetail extends RawListItem {
  altNames?: string[];
  synopsis?: string | null;
  description?: string | null;
  originalNetwork?: { name?: string }[] | null;
  networks?: { name?: string }[] | null;
  runtime?: string | null;
  airsOn?: string | null;
  trailer?: { url?: string }[] | null;
  casts?: { name?: string }[] | null;
  genre?: { name?: string }[] | null;
  genres?: { name?: string }[] | null;
  episodes?: RawEpisode[];
  tvStatus?: string | null;
}

/** Series detail — metadata from /v1/drama/detail, episode list from SSR hrefs
 *  (complete, handles 100-ep shows) enriched with titles/durations from the
 *  embedded detail payload. */
export async function dramaDetail(slug: string): Promise<DramaDetail> {
  const html = await dcFetchHtml(`/drama/${encodeURIComponent(slug)}`);
  const state = parseNgState(html);
  const entry = findEntry(state, '/v1/drama/detail');
  const raw = entry?.b as RawDetail | undefined;
  if (!raw || !raw.name) throw new Error(`drama not found: ${slug}`);

  const base = mapDramaItem(raw) || { slug, title: raw.name, cover: '', source: 'dramacool' as const };
  const byEp = new Map<string, DramaEpisode>();
  for (const e of raw.episodes || []) {
    const mapped = mapEpisode(e);
    if (mapped) byEp.set(mapped.epKey, mapped);
  }
  const episodes = episodesFromHrefs(html, slug).map((e) => {
    const rich = byEp.get(e.epKey);
    return rich ? { ...e, title: rich.title, durationMin: rich.durationMin } : e;
  });
  if (!episodes.length) episodes.push(...[...byEp.values()].sort((a, b) => a.number - b.number));

  return {
    drama: { ...base, status: raw.tvStatus || base.status },
    altNames: raw.altNames || undefined,
    description: (raw.description || raw.synopsis || '').replace(/<[^>]*>/g, '').trim() || undefined,
    network: raw.originalNetwork?.[0]?.name || raw.networks?.[0]?.name || undefined,
    runtime: raw.runtime || undefined,
    airsOn: raw.airsOn || undefined,
    trailerUrl: raw.trailer?.[0]?.url || undefined,
    casts: (raw.casts || []).map((c) => c.name || '').filter(Boolean).slice(0, 12),
    genres: (raw.genre || raw.genres || []).map((g) => g.name || '').filter(Boolean),
    episodes,
  };
}

// ── Explore — the /explore SSR page exposes /v1/drama/list: every drama with
// country / genre / status / type / year filters, sort and real pagination
// (30 per page). Verified live param values:
//   country=South Korea|China|Japan|Thailand|Hong Kong|Taiwan|Philippines
//   genre=<Taxonomy name, e.g. Romance|Comedy|Action>
//   status=Completed|Ongoing|Upcoming
//   type=TVSeries|Movie|Anime|Hollywood
//   year=<yyyy>   sort=most_popular|recent|top_rated   page=<n>

export interface DramaExploreFilters {
  country?: string;
  genre?: string;
  status?: string;
  type?: string;
  year?: string;
  sort?: string;
  page?: number;
}

export async function dramaExplore(
  f: DramaExploreFilters
): Promise<{ items: DramaItem[]; pageInfo: { total: number; currentPage: number; totalPages: number; hasNext: boolean } }> {
  const q = new URLSearchParams();
  if (f.country) q.set('country', f.country);
  if (f.genre) q.set('genre', f.genre);
  if (f.status) q.set('status', f.status);
  if (f.type) q.set('type', f.type);
  if (f.year) q.set('year', f.year);
  q.set('sort', f.sort || 'most_popular');
  q.set('page', String(Math.max(1, f.page || 1)));
  const html = await dcFetchHtml(`/explore?${q.toString()}`);
  const state = parseNgState(html);
  const entry = findEntry(state, '/v1/drama/list');
  const body = entry?.b as
    | { currentPage?: number; hasNext?: boolean; totalPages?: number; body?: RawListItem[] }
    | undefined;
  const items = (body?.body || []).map(mapDramaItem).filter((x): x is DramaItem => !!x);
  return {
    items,
    pageInfo: {
      total: items.length,
      currentPage: body?.currentPage || Math.max(1, f.page || 1),
      totalPages: body?.totalPages || 1,
      hasNext: !!body?.hasNext,
    },
  };
}

// ── Streams ──────────────────────────────────────────────────────────────────

/** Host-absolute an embed url that may be protocol-relative or path-y */
function absEmbedUrl(url: string): string {
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http')) return url;
  return `https://dramacool9.rest${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Dead-embed hygiene — dramacool sometimes lists hoster entries that 404 for
 *  EVERYONE, e.g. kissasian's gdriveplayer wrapper carrying an EMPTY `data=`
 *  param (observed live on "Doona!" ep1, Oct 2026). The player cannot detect
 *  a cross-origin 404, so that junk always costs the user the first tap +
 *  one manual failover. Filtering provably-empty player params at build time
 *  removes the dead entry before it ever reaches the source list. */
function isDeadEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url, 'https://x.invalid');
    for (const [k, v] of u.searchParams) {
      // the params these wrapper players actually play from — an empty value
      // means the embed renders nothing but a 404 / error screen
      if (['data', 'url', 'id', 'file', 'vid', 'code'].includes(k.toLowerCase()) && !v.trim()) return true;
    }
  } catch {
    /* unparseable — let the watchdog deal with it */
  }
  return false;
}

// ── MyAsianTV (ww7.myasiantv.rest) — independent episode mirror ─────────────
// Dramacool's episode payload now points at MyAsianTV watch pages (WordPress),
// and MyAsianTV embeds its own player (zumivids) with a built-in server
// switcher. Both the watch page and its embed are plain-200 from datacenter
// IPs (no Cloudflare bot-fight), so it's a reliable extra tier. It is reached
// two ways: (a) fast path — the dramacool episode payload itself carries the
// MyAsianTV epUrl; (b) search path — the WordPress REST API
// (/wp-json/wp/v2/search) finds the episode post by title + number.

const MAT_HOST = 'https://ww7.myasiantv.rest';
const MAT_UA = BROWSER_UA;

async function matFetch(url: string, timeoutMs = 9000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': MAT_UA,
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Pull the player embed out of a MyAsianTV watch page (skips analytics junk).
 *  Zumivids (their native player) is preferred when present. */
export function matEmbedFromPage(html: string): string | null {
  const candidates = [
    ...[...html.matchAll(/<iframe[^>]+(?:data-src|src)="(https?:\/\/[^"']+)"/gi)].map((m) => m[1]),
  ];
  const junk = /googletagmanager|google-analytics|adservice|doubleclick|facebook|disqus|youtube\.com|youtu\.be|wp-json|oembed/i;
  const clean = candidates.filter((u) => !junk.test(u));
  return clean.find((u) => u.includes('zumivids')) || clean[0] || null;
}

interface MatSearchHit {
  title?: string;
  url?: string;
}

/** Search path: find `ep` of `title` on MyAsianTV via the WP REST search API. */
async function matSearchEpisodePage(title: string, ep: number): Promise<string | null> {
  try {
    const raw = await matFetch(
      `${MAT_HOST}/wp-json/wp/v2/search?search=${encodeURIComponent(title.slice(0, 60))}&per_page=20`,
      8000
    );
    const hits = JSON.parse(raw) as MatSearchHit[];
    const epRe = /-ep-([0-9.]+)-eng-sub\/?$/;
    // Exact episode post first, else derive the series slug from any hit
    let seriesSlug = '';
    for (const h of hits) {
      const url = h.url || '';
      const m = url.match(epRe);
      if (m && Math.abs(parseFloat(m[1]) - ep) < 0.001) return url;
      if (!seriesSlug && m) seriesSlug = url.replace(epRe, '');
    }
    if (!seriesSlug) return null;
    return `${seriesSlug}-ep-${ep}-eng-sub/`;
  } catch {
    return null;
  }
}

const matEpCache = new Map<string, { at: number; embed: string | null }>();
const MAT_TTL = 10 * 60_000;

/** Resolve the MyAsianTV embed for an episode. `matEpUrl` = fast-path url from
 *  the dramacool payload; falls back to WP-REST search when absent. */
async function matEpisodeEmbed(
  title: string,
  ep: number,
  matEpUrl: string | null
): Promise<string | null> {
  const cacheKey = (matEpUrl || `${title}#${ep}`).toLowerCase();
  const hit = matEpCache.get(cacheKey);
  if (hit && Date.now() - hit.at < MAT_TTL) return hit.embed;

  let pageUrl = matEpUrl && /^https?:\/\//.test(matEpUrl) ? matEpUrl : null;
  if (!pageUrl) pageUrl = await matSearchEpisodePage(title, ep);
  if (!pageUrl) {
    matEpCache.set(cacheKey, { at: Date.now(), embed: null });
    return null;
  }
  try {
    const html = await matFetch(pageUrl);
    const embed = matEmbedFromPage(html);
    matEpCache.set(cacheKey, { at: Date.now(), embed });
    return embed;
  } catch {
    matEpCache.set(cacheKey, { at: Date.now(), embed: null });
    return null;
  }
}

// ── Per-(slug, ep) streams cache — the watch page costs 1-2 s, replays and
//    next-episode-return trips should be instant. Stale copy is served when
//    the upstream flaps so a 5-minute-old chain beats a dead error screen.
export interface DramaStreamsPayloadData {
  sources: VideoSource[];
  providersTried: { provider: string; ok: boolean; error?: string }[];
  episodeTitle?: string;
  /** Verified Rakuten Viki match — official web link only (their streams are
   *  Widevine DRM'd and their player refuses framing, so it never joins the
   *  playable chain; the Player surfaces it as a one-tap official chip). */
  viki?: { title: string; url: string };
}

const streamsCache = new Map<string, { at: number; data: DramaStreamsPayloadData }>();
const STREAMS_TTL = 8 * 60_000;

function episodeMatches(raw: RawEpisode, ep: number): boolean {
  // The payload's own `number` field is authoritative (epUrls no longer carry
  // a parseable episode-… segment — they point at MyAsianTV).
  if (typeof raw.number === 'number' && Number.isFinite(raw.number)) {
    return Math.abs(raw.number - ep) < 0.001;
  }
  const m = (raw.epUrl || '').match(/episode-([0-9]+(?:-[0-9]+)?)/);
  return !!m && m[1].replace(/-/g, '.') === String(ep);
}

/** Episode sources — ordered fallback chain:
 *  1. pre-resolved direct HLS (hlsproxy) when the SSR worker managed it
 *  2. every hoster embed the episode carries (vidmoly/streamtape/mixdrop/asianctv…)
 *  3. MyAsianTV's own embedded player (zumivids) for the same episode
 *  4. YouTube full-episode upload (Viki Global TV, KBS World, iQiyi…) —
 *     official channel uploads on the native player, zero server bandwidth
 *  + a Rakuten Viki official web link when the title is verifiably on Viki
 *    (their episodes are DRM'd and unframeable, so it rides alongside the
 *    chain as an official chip instead of a source).
 *
 *  `opts.title` (drama display title, forwarded by the client) unlocks the
 *  parallel fast path: the YouTube and Viki lookups need only the title, so
 *  they run CONCURRENTLY with the dramacool watch-page fetch instead of
 *  after it — cold resolution stays ~2-3 s instead of +4-8 s of pile-up. */
export async function dramaStreams(
  slug: string,
  ep: number,
  opts: { providers?: string[]; title?: string } = {}
): Promise<DramaStreamsPayloadData> {
  const enabled = new Set(
    opts.providers || ['dc-embeds', 'mat', 'yt', 'dc-hls', 'viki']
  );
  const cacheKey = `${slug}|${ep}|${[...enabled].sort().join(',')}`;
  const hit = streamsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < STREAMS_TTL) return hit.data;

  const sources: VideoSource[] = [];
  const providersTried: { provider: string; ok: boolean; error?: string }[] = [];

  // ── Parallel side-tiers (YouTube full episodes + Viki bridge) ─────────────
  // Both run from the display title alone, so they start immediately — no
  // waiting on the dramacool page. Hard per-tier budgets keep a slow YouTube
  // or Viki answer from stalling the whole response; misses are honest
  // ok:false rows, not errors.
  const title = (opts.title || '').trim();
  const ytTier = (async (): Promise<VideoSource | null> => {
    if (!enabled.has('yt') || !title) return null;
    try {
      // Two query shapes race the cache — "<title>" episode N english sub and
      // the compact "<title> ep N". youtubeSearch caches 30 min, so replays
      // (and the next episode of the same show) cost one search each.
      const [a, b] = await Promise.all([
        youtubeSearch(`"${title}" episode ${ep} english sub`, 9000).catch(() => []),
        youtubeSearch(`${title} ep ${ep}`, 9000).catch(() => []),
      ]);
      const ranked = rankYoutubeDramaEpisode([...a, ...b], title, ep);
      if (!ranked) return null;
      return {
        provider: 'yt',
        url: `youtube:${ranked.video.videoId}`,
        quality: ranked.official ? 'official' : 'community',
        isM3U8: false,
        note: ranked.official
          ? `Official YouTube upload · ${ranked.video.channel}`
          : `YouTube upload · ${ranked.video.channel}`,
      };
    } catch {
      return null;
    }
  })();
  const vikiTier = (async () => {
    if (!enabled.has('viki') || !title) return null;
    return vikiTitleSearch(title, 7000).catch(() => null);
  })();

  // ── Dramacool watch page (drives tiers 1-3) ────────────────────────────────
  const html = await dcFetchHtml(`/drama/${encodeURIComponent(slug)}/episode-${ep}`);
  const state = parseNgState(html);

  // (1) pre-resolved direct stream — /v1/drama/get-stream-url response cache
  if (enabled.has('dc-hls')) {
    const resolved = findEntry(state, '/v1/drama/get-stream-url');
    const rSources =
      (resolved?.b as { sources?: { url?: string; isM3U8?: boolean; quality?: string }[] } | undefined)?.sources || [];
    for (const s of rSources) {
      if (!s.url) continue;
      // Played straight from the user's browser only when CORS allows it —
      // otherwise the Player routes it through /api/proxy (server bandwidth).
      const url = s.url.startsWith('http') ? s.url : absEmbedUrl(s.url);
      sources.push({
        provider: 'dc-hls',
        url,
        quality: s.quality || 'auto',
        isM3U8: s.isM3U8 ?? url.includes('.m3u8'),
        note: 'Direct stream',
      });
      break; // one direct source is enough — embeds are the fallback depth
    }
    providersTried.push({
      provider: 'dc-hls',
      ok: sources.length > 0,
      error: sources.length ? undefined : 'no pre-resolved stream',
    });
  }

  // (2) hoster embeds from the detail payload's matching episode
  const detail = findEntry(state, '/v1/drama/detail');
  const raw = detail?.b as RawDetail | undefined;
  const rawEps = raw?.episodes || [];
  const epRaw = rawEps.find((e) => episodeMatches(e, ep));
  const streamUrls = (epRaw?.streamUrls || []) as { source?: string; url?: string }[];
  if (enabled.has('dc-embeds')) {
    for (const s of streamUrls) {
      if (!s.url) continue;
      const abs = absEmbedUrl(s.url);
      if (isDeadEmbedUrl(abs)) continue; // provably-404 entry — skip, save the tap
      const host = s.source || 'mirror';
      sources.push({
        provider: `dc-embed:${host}`,
        url: `embed:${abs}`,
        quality: 'embed',
        isM3U8: false,
        note: 'Mirror player',
      });
    }
    providersTried.push({
      provider: 'dc-embeds',
      ok: streamUrls.length > 0,
      error: streamUrls.length ? undefined : 'no embeds on episode',
    });
  }

  // (3) MyAsianTV — the same episode on the independent mirror. Runs in
  //     parallel with nothing upstream of it (the epUrl comes from this very
  //     page), but a hard 9 s budget keeps it from stalling the response; a
  //     miss here just leaves the dramacool embeds as the fallback depth.
  if (enabled.has('mat')) {
    const matUrl = epRaw?.epUrl || null;
    const embed = await matEpisodeEmbed(raw?.name || slug, ep, matUrl);
    if (embed) {
      sources.push({
        provider: 'mat',
        url: `embed:${embed}`,
        quality: 'embed',
        isM3U8: false,
        note: 'MyAsianTV player',
      });
    }
    providersTried.push({
      provider: 'mat',
      ok: !!embed,
      error: embed ? undefined : 'no mirror match',
    });
  }

  // (4) YouTube full-episode upload — official licensor/broadcaster channels
  //     (Viki Global TV, KBS World, iQiyi…). Started in parallel at the top;
  //     awaited here so it lands after the mirror tiers in failover order.
  //     A miss just means YouTube has no qualifying upload for this episode.
  if (enabled.has('yt')) {
    const ytSource = title ? await ytTier : null;
    if (ytSource) sources.push(ytSource);
    providersTried.push({
      provider: 'yt',
      ok: !!ytSource,
      error: ytSource ? undefined : 'no official upload found',
    });
  }

  // (5) Rakuten Viki bridge — their episodes are Widevine DRM'd and their
  //     player refuses framing, so a match never becomes a playable source.
  //     It rides the payload as an official web link the Player renders as a
  //     chip (honest label: Viki free tier carries their own ad breaks).
  let vikiMatch: Awaited<typeof vikiTier> = null;
  if (enabled.has('viki')) {
    vikiMatch = title ? await vikiTier : null;
    providersTried.push({
      provider: 'viki',
      ok: !!vikiMatch,
      error: vikiMatch ? undefined : 'no verified match',
    });
  }

  // Mirror tiers overlap (MyAsianTV often re-embeds the same hoster) — drop
  // exact-URL duplicates so a dead hoster never eats two failover steps.
  const seen = new Set<string>();
  const deduped = sources.filter((s) => {
    const k = s.url.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const data: DramaStreamsPayloadData = {
    sources: deduped,
    providersTried,
    episodeTitle: epRaw?.title || undefined,
    viki: vikiMatch || undefined,
  };
  streamsCache.set(cacheKey, { at: Date.now(), data });
  return data;
}
