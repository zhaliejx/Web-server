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

/** Episode sources — ordered fallback chain:
 *  1. pre-resolved direct HLS (hlsproxy) when the SSR worker managed it
 *  2. every hoster embed the episode carries (kissasian/dood/streamtape/…) */
export async function dramaStreams(
  slug: string,
  ep: number
): Promise<{ sources: VideoSource[]; providersTried: { provider: string; ok: boolean; error?: string }[]; episodeTitle?: string }> {
  const sources: VideoSource[] = [];
  const providersTried: { provider: string; ok: boolean; error?: string }[] = [];
  const html = await dcFetchHtml(`/drama/${encodeURIComponent(slug)}/episode-${ep}`);
  const state = parseNgState(html);

  // (1) pre-resolved direct stream — /v1/drama/get-stream-url response cache
  const resolved = findEntry(state, '/v1/drama/get-stream-url');
  const rSources =
    (resolved?.b as { sources?: { url?: string; isM3U8?: boolean; quality?: string }[] } | undefined)?.sources || [];
  for (const s of rSources) {
    if (!s.url) continue;
    // Play straight from the user's browser — /api/proxy would face the
    // Cloudflare challenge our server cannot pass.
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
  providersTried.push({ provider: 'dc-hls', ok: sources.length > 0, error: sources.length ? undefined : 'no pre-resolved stream' });

  // (2) hoster embeds from the detail payload's matching episode
  const detail = findEntry(state, '/v1/drama/detail');
  const rawEps = (detail?.b as RawDetail | undefined)?.episodes || [];
  const want = String(ep); // "8" or "16.1" — compare in dotted form
  const epRaw = rawEps.find((e) => {
    const m = (e.epUrl || '').match(/episode-([0-9]+(?:-[0-9]+)?)/);
    return m && m[1].replace(/-/g, '.') === want;
  });
  const streamUrls = (epRaw?.streamUrls || []) as { source?: string; url?: string }[];
  for (const s of streamUrls) {
    if (!s.url) continue;
    const host = s.source || 'mirror';
    sources.push({
      provider: `dc-embed:${host}`,
      url: `embed:${absEmbedUrl(s.url)}`,
      quality: 'embed',
      isM3U8: false,
      note: 'Mirror player',
    });
  }
  providersTried.push({ provider: 'dc-embeds', ok: streamUrls.length > 0, error: streamUrls.length ? undefined : 'no embeds on episode' });

  return { sources, providersTried, episodeTitle: epRaw?.title || undefined };
}
