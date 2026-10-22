// ── Gogoanime.by direct scraping engine (verified live) ─────────────────────
// Pipeline (all steps validated end-to-end against the real site):
//   1. slug guess / site search  →  /category/{slug}/ page
//   2. category page pagination  →  episode URLs {prefix}-episode-{N}-english-subbed/
//   3. episode page              →  .player-type-link[data-src] player URLs
//   4. /player/?source=blogger&url=… page → JW Player `sources` JSON
//   5. googlevideo direct MP4s (server-IP signed) → served via /api/proxy
// Fallback assist: relay search (user's api-ajest deployment + community rouge)
// for slug discovery when the direct site search comes up empty.

import { GOGO_BASE, RELAY_HOSTS, relayGogoSearch, cached } from './upstream';
import type { VideoSource } from './types';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ── HTML fetch with browser-like headers ────────────────────────────────────
export async function gogoFetchHtml(url: string, timeoutMs = 12000, referer = `${GOGO_BASE}/`): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: referer,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ── Title → slug helpers ────────────────────────────────────────────────────
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Candidate slugs: english title, romaji-ish full title, stripped season words.
 *  Gogo hyphenates apostrophes ("Journey's End" → journey-s-end), so each title
 *  also yields an apostrophe→hyphen variant — matches real slugs like
 *  frieren-beyond-journey-s-end exactly.
 *  Spaced titles are additionally squeezed ("DAN DA DAN" → dandadan): the site's
 *  WordPress search matches whole words only, so ?s=dan+da+dan can never find a
 *  post titled "Dandadan" — the squeezed slug is often the ONLY way in. */
export function slugCandidates(titles: { main: string; english?: string; romaji?: string; native?: string }): string[] {
  const out = new Set<string>();
  for (const t of [titles.main, titles.english, titles.romaji, titles.native]) {
    if (!t) continue;
    for (const variant of [t, t.replace(/[''`]/g, '-')]) {
      const base = slugifyTitle(variant);
      if (base) {
        out.add(base);
        // squeeze BEFORE the season suffix so "dan-da-dan" → "dandadan" ranks early
        const squeezed = base.replace(/-/g, '');
        if (squeezed !== base) out.add(squeezed);
        // gogo often appends "1" for the first season (one-piece → one-piece-1)
        out.add(`${base}-1`);
      }
    }
  }
  return Array.from(out).filter(Boolean);
}

function similar(a: string, b: string): number {
  const na = a.replace(/[^a-z0-9]/g, '');
  const nb = b.replace(/[^a-z0-9]/g, '');
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 75;
  // token overlap
  const ta = new Set(a.split('-').filter(Boolean));
  const tb = new Set(b.split('-').filter(Boolean));
  let inter = 0;
  ta.forEach((x) => tb.has(x) && inter++);
  return Math.round((inter / Math.max(ta.size, tb.size)) * 60);
}

// ── Step 1: site search (WP ?s=) → category slugs ───────────────────────────
export async function gogoSearchSlugs(q: string): Promise<string[]> {
  return cached(`gogo:search:${q.toLowerCase()}`, 30 * 60_000, async () => {
    const html = await gogoFetchHtml(`${GOGO_BASE}/?s=${encodeURIComponent(q)}`, 12000);
    const slugs = new Set<string>();
    const re = /href="https:\/\/gogoanime\.by\/category\/([a-z0-9-]+)\//g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) slugs.add(m[1]);
    return Array.from(slugs);
  });
}

// ── Step 2: category page → episode map ─────────────────────────────────────
export interface GogoSeries {
  title: string;
  /** episode number → episode page path (relative) */
  episodes: Map<number, string>;
  /** dubbed episode numbers, if separate pages exist */
  dubEpisodes: Map<number, string>;
  synopsis?: string;
  poster?: string;
}

function extractEpisodeMap(html: string, slug: string): { sub: Map<number, string>; dub: Map<number, string> } {
  const sub = new Map<number, string>();
  const dub = new Map<number, string>();
  // Episode prefix: slug minus trailing season number ("one-piece-1" → "one-piece")
  const prefix = slug.replace(/-\d+$/, '');
  const re = new RegExp(`href="https:\\/\\/gogoanime\\.by\\/(${prefix}-episode-(\\d+)([a-z-]*)?)\\/"`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const path = m[1];
    const num = parseInt(m[2], 10);
    const suffix = m[3] || '';
    if (!isFinite(num) || num <= 0) continue;
    if (suffix.includes('dubbed')) {
      if (!dub.has(num)) dub.set(num, path);
    } else if (suffix.includes('subbed')) {
      if (!sub.has(num)) sub.set(num, path);
    }
  }
  return { sub, dub };
}

/** How many total pages the category pagination exposes (?page=N links) */
function maxCategoryPage(html: string): number {
  let max = 1;
  const re = /\?page=(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const n = parseInt(m[1], 10);
    if (isFinite(n) && n > max && n <= 200) max = n;
  }
  return max;
}

export async function gogoCategory(slug: string, wantEpisode?: number): Promise<GogoSeries | null> {
  return cached(`gogo:cat:${slug}:${wantEpisode ?? 'all'}`, 30 * 60_000, async () => {
    const first = await gogoFetchHtml(`${GOGO_BASE}/category/${slug}/`, 14000);
    let { sub, dub } = extractEpisodeMap(first, slug);

    // Need more pages? Fetch paginated pages until the target episode shows up.
    const maxPage = Math.min(maxCategoryPage(first), 30);
    if (wantEpisode && wantEpisode > 0) {
      const have = sub.has(wantEpisode) || dub.has(wantEpisode);
      if (!have && maxPage > 1) {
        // Episodes usually list newest-first on later pages; probe up to 6 pages
        const pages = Array.from({ length: Math.min(maxPage, 8) - 1 }, (_, i) => i + 2);
        const results = await Promise.allSettled(
          pages.map((p) => gogoFetchHtml(`${GOGO_BASE}/category/${slug}/?page=${p}`, 12000))
        );
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          const more = extractEpisodeMap(r.value, slug);
          more.sub.forEach((v, k) => sub.set(k, v));
          more.dub.forEach((v, k) => dub.set(k, v));
          if (sub.has(wantEpisode) || dub.has(wantEpisode)) break;
        }
      }
    }

    if (!sub.size && !dub.size) return null;

    const titleMatch = first.match(/<h1[^>]*class="entry-title"[^>]*>([^<]+)</i) || first.match(/<title>([^<]+)</i);
    const posterMatch = first.match(/property="og:image" content="([^"]+)"/);
    const descMatch = first.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]{100,4000}?)<\/div>/);

    return {
      title: titleMatch ? titleMatch[1].replace(/\s*[|–-]\s*Gogoanime.*$/i, '').trim() : slug,
      episodes: sub,
      dubEpisodes: dub,
      synopsis: descMatch ? descMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200) : undefined,
      poster: posterMatch ? posterMatch[1] : undefined,
    };
  });
}

// ── Step 3: episode page → player URLs ──────────────────────────────────────
export interface GogoPlayerLink {
  kind: 'blogger' | 'embed' | 'other';
  playerUrl: string; // absolute gogo player URL (server decrypts url= param)
}

export async function gogoEpisodePlayers(episodePath: string): Promise<GogoPlayerLink[]> {
  const html = await cached(`gogo:ep:${episodePath}`, 15 * 60_000, async () =>
    gogoFetchHtml(`${GOGO_BASE}/${episodePath}/`, 14000)
  );
  const links: GogoPlayerLink[] = [];
  const re = /data-src="(https:\/\/gogoanime\.by\/player\/\?source=([a-z]+)&amp;url=[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = m[1].replace(/&amp;/g, '&');
    const kind = (m[2] as GogoPlayerLink['kind']) || 'other';
    links.push({ kind, playerUrl: url });
  }
  // blogger (direct MP4) first, embed second
  links.sort((a, b) => (a.kind === 'blogger' ? -1 : 0) - (b.kind === 'blogger' ? -1 : 0));
  return links;
}

// ── Step 4: player page → JW sources JSON ───────────────────────────────────
interface JwSource {
  file: string;
  type?: string;
  label?: string;
  default?: boolean;
}

export async function gogoPlayerSources(link: GogoPlayerLink): Promise<VideoSource[]> {
  return cached(`gogo:src:${link.playerUrl.slice(-60)}`, 10 * 60_000, async () => {
    const html = await gogoFetchHtml(link.playerUrl, 14000, `${GOGO_BASE}/`);
    const out: VideoSource[] = [];

    if (link.kind === 'blogger') {
      const arrMatch = html.match(/var sources = (\[[\s\S]*?\]);/);
      if (arrMatch) {
        try {
          const arr: JwSource[] = JSON.parse(arrMatch[1]);
          for (const s of arr) {
            if (!s.file) continue;
            const isHls = /\.m3u8/i.test(s.file);
            out.push({
              provider: `gogo-by-${s.label ? s.label.toLowerCase() : 'auto'}`,
              url: s.file,
              quality: s.label || 'auto',
              isM3U8: isHls,
            });
          }
        } catch {
          /* fall through */
        }
      }
      // single-file fallback (var fileUrl)
      if (!out.length) {
        const fileMatch = html.match(/var fileUrl = "([^"]+)"/);
        if (fileMatch) {
          out.push({
            provider: 'gogo-by-auto',
            url: fileMatch[1],
            quality: 'auto',
            isM3U8: /\.m3u8/i.test(fileMatch[1]),
          });
        }
      }
      return out;
    }

    // embed kind: player page wraps a third-party iframe — no direct file to
    // hand to <video>. Return empty so the resolver moves to the next link.
    return out;
  });
}

// ── Direct episode-page probe (episodes past the category widget) ───────────
// gogoanime.by category pages list only recent episodes; older ones 301 home.
// A single redirect-manual GET tells us: 200 → page exists, 301/404 → not hosted.
export async function gogoEpisodeExists(path: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${GOGO_BASE}/${path}/`, {
      signal: ctrl.signal,
      redirect: 'manual', // existence check only — do not follow homepage 301
      cache: 'no-store',
      headers: { 'User-Agent': BROWSER_UA },
    });
    try {
      await res.text(); // drain body to free the socket
    } catch {
      /* ignore */
    }
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// ── Full resolver: titles + episode number → playable source chain ─────────
export interface ResolveInput {
  main: string;
  english?: string;
  romaji?: string;
  native?: string;
  episode: number;
}

export interface ResolveStep {
  provider: string;
  ok: boolean;
  error?: string;
}

export interface ResolveOutput {
  sources: VideoSource[];
  steps: ResolveStep[];
  matchedSlug?: string;
  episodeTitle?: string;
}

type ExtractResult =
  | { status: 'ok'; sources: VideoSource[] }
  | { status: 'no-category' }
  | { status: 'no-episode' }
  | { status: 'no-sources' };

/** Shared slug→sources extractor used by every strategy.
 *  Handles two gogoanime.by quirks:
 *  1. Widget trap — category pages list only RECENT episodes (dandadan lists
 *     3–12), so earlier episodes must be probed at their canonical permalink.
 *  2. Soft-404 categories — unknown /category/ URLs 301 to the homepage, yet
 *     the episode pages themselves still exist (e.g. one-piece). So a missing
 *     category must NOT abort resolution: probe the permalink directly. */
async function extractEpisodeSources(slug: string, ep: number): Promise<ExtractResult> {
  const series = await gogoCategory(slug, ep);
  const prefix = slug.replace(/-\d+$/, '');
  let path = series ? series.episodes.get(ep) || series.dubEpisodes.get(ep) : undefined;
  if (!path) {
    const probes = [
      `${prefix}-episode-${ep}-english-subbed`,
      `${prefix}-episode-${ep}-english-dubbed`,
      `${prefix}-episode-${ep}`,
    ];
    for (const p of probes) {
      if (await gogoEpisodeExists(p)) {
        path = p;
        break;
      }
    }
  }
  if (!path) return { status: series ? 'no-episode' : 'no-category' };
  const players = await gogoEpisodePlayers(path);
  for (const link of players) {
    const sources = await gogoPlayerSources(link);
    if (sources.length) return { status: 'ok', sources };
  }
  return { status: 'no-sources' };
}

export async function resolveGogoStreams(input: ResolveInput): Promise<ResolveOutput> {
  const steps: ResolveStep[] = [];
  const ep = Math.max(1, Math.floor(input.episode));

  // ── Strategy A: direct slug guess ─────────────────────────────────────────
  const candidates = slugCandidates(input);
  for (const slug of candidates.slice(0, 6)) {
    try {
      const r = await extractEpisodeSources(slug, ep);
      if (r.status === 'ok' && r.sources) {
        steps.push({ provider: `gogo-by:${slug}`, ok: true });
        return { sources: r.sources, steps, matchedSlug: slug };
      }
      steps.push({
        provider: `gogo-by:${slug}`,
        ok: false,
        error:
          r.status === 'no-category'
            ? 'category not found'
            : r.status === 'no-episode'
              ? `episode ${ep} not hosted`
              : 'no extractable sources',
      });
    } catch (e) {
      steps.push({ provider: `gogo-by:${slug}`, ok: false, error: (e as Error).message?.slice(0, 60) });
    }
  }

  // ── Strategy B: site search (english + romaji), pick best-matching slug ───
  try {
    const queries = Array.from(new Set([input.english, input.romaji, input.main].filter(Boolean) as string[]));
    const slugs = new Set<string>();
    for (const q of queries.slice(0, 3)) {
      try {
        (await gogoSearchSlugs(q)).forEach((x) => slugs.add(x));
      } catch {
        /* per-query failure tolerated */
      }
    }
    const ranked = Array.from(slugs)
      .map((s) => ({
        s,
        score: Math.max(
          similar(s, slugifyTitle(input.main)),
          input.english ? similar(s, slugifyTitle(input.english)) : 0,
          input.romaji ? similar(s, slugifyTitle(input.romaji)) : 0
        ),
      }))
      .filter((x) => x.score >= 40)
      .sort((a, b) => b.score - a.score);
    steps.push({ provider: 'gogo-by:search', ok: ranked.length > 0, error: ranked.length ? undefined : 'no close match' });
    for (const { s } of ranked.slice(0, 3)) {
      try {
        const r = await extractEpisodeSources(s, ep);
        if (r.status === 'ok' && r.sources) {
          steps.push({ provider: `gogo-by:${s}`, ok: true });
          return { sources: r.sources, steps, matchedSlug: s };
        }
      } catch {
        /* keep trying */
      }
    }
  } catch (e) {
    steps.push({ provider: 'gogo-by:search', ok: false, error: (e as Error).message?.slice(0, 60) });
  }

  // ── Strategy C: relay search assist (api-ajest / rouge) → slug → direct scrape ──
  try {
    const results = await relayGogoSearch(input.english || input.romaji || input.main, 7000);
    const target = slugifyTitle(input.english || input.romaji || input.main);
    const ranked = results
      .map((r) => ({ r, score: similar(r.id, target) }))
      .filter((x) => x.score >= 40)
      .sort((a, b) => b.score - a.score);
    steps.push({ provider: 'relay-search', ok: ranked.length > 0, error: ranked.length ? undefined : 'no close match' });
    for (const { r } of ranked.slice(0, 3)) {
      try {
        const x = await extractEpisodeSources(r.id, ep);
        if (x.status === 'ok' && x.sources) {
          steps.push({ provider: `relay-gogo:${r.id}`, ok: true });
          return { sources: x.sources, steps, matchedSlug: r.id };
        }
      } catch {
        /* keep trying */
      }
    }
  } catch (e) {
    steps.push({ provider: 'relay-search', ok: false, error: (e as Error).message?.slice(0, 60) });
  }

  return { sources: [], steps };
}

// ── Availability probe (health endpoint) ────────────────────────────────────
export async function gogoProbe(): Promise<boolean> {
  try {
    const html = await gogoFetchHtml(GOGO_BASE, 8000);
    return /gogoanime/i.test(html) && html.length > 10000;
  } catch {
    return false;
  }
}

export async function relayProbe(): Promise<boolean> {
  for (const host of RELAY_HOSTS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      // Probe the search path (the only one Ajest consumes); 'one piece' is a
      // warm, cache-friendly keyword — cache-hits answer in <2s, fresh scrapes
      // on ephemeral deployments may be slow, hence the short window.
      const res = await fetch(`${host}/gogoanime/search?keyword=one%20piece&page=1`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      });
      const ok = res.ok && (await res.text()).includes('"animes"');
      clearTimeout(t);
      if (ok) return true;
    } catch {
      /* next host */
    }
  }
  return false;
}
