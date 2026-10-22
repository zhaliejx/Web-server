// ── AnimeKaizen (animekaizen.org) — latest-episode mirror tier ──────────────
// animekaizen.org is a WordPress catalog (no Cloudflare, open wp-json REST)
// of ~1k recent titles. Each anime post embeds ONE player — the latest
// episode — either Blogger-hosted (video.g iframe, no X-Frame-Options →
// embeddable from any origin) or Vimeo (domain-locked 401/403 → skip).
//
// The Blogger googlevideo URLs inside video.g are IP-locked to whoever
// requested the page, so server-side extraction is impossible — but the
// iframe itself plays in the user's browser exactly like the source site.
// We therefore surface it as an `embed:` source, same pattern as VidLink.
//
// Content guard: the post carries the episode title ("Black Clover Season 2
// Episode 3 English Subbed"). We parse season/episode out of it and only
// offer the source when it matches the requested episode, so the player
// never plays the wrong content.
import { fetchJson, cached } from './upstream';

const KAIZEN_BASE = 'https://www.animekaizen.org';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface KaizenHit {
  /** iframe-ready blogger player URL */
  embed: string;
  /** e.g. "Black Clover Season 2 Episode 3 English Subbed" */
  epTitle: string;
  season: number | null;
  episode: number | null;
  slug: string;
  postUrl: string;
}

interface WpPost {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&[a-z#0-9]+;/g, ' ')
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Score how well a kaizen slug matches a normalized title (0 = no match). */
function slugScore(slugNorm: string, titleNorm: string): number {
  if (!titleNorm || !slugNorm) return 0;
  if (slugNorm === titleNorm) return 100;
  if (slugNorm.startsWith(titleNorm + ' ') || slugNorm === titleNorm.replace(/ /g, '-')) return 92;
  if (slugNorm.includes(titleNorm)) return 80;
  const toks = titleNorm.split(' ').filter((t) => t.length > 2);
  if (!toks.length) return 0;
  const hits = toks.filter((t) => slugNorm.includes(t)).length;
  return hits === toks.length ? 62 : 0; // every token must appear
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { Accept: 'text/html,*/*', 'User-Agent': UA, Referer: `${KAIZEN_BASE}/` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Parse "… Season 2 Episode 3 …" → { season, episode } */
export function parseKaizenEpisodeTitle(t: string): { season: number | null; episode: number | null } {
  const season = /season\s*0*(\d{1,2})/i.exec(t);
  const ep = /ep(?:isode)?\s*0*(\d{1,3})/i.exec(t);
  return {
    season: season ? parseInt(season[1], 10) : null,
    episode: ep ? parseInt(ep[1], 10) : null,
  };
}

function extractBloggerEmbed(html: string): string | null {
  // iframe src may carry &amp; — the token itself is pure base64url
  const m = /blogger\.com\/video\.g\?token=([A-Za-z0-9_\-]{40,})/.exec(html);
  if (!m) return null;
  return `https://www.blogger.com/video.g?token=${m[1]}&origin=op.blogspot.com`;
}

async function findPost(title: string): Promise<WpPost | null> {
  const norm = normalize(title);
  if (norm.length < 3) return null;
  const posts = await cached(`kaizen:search:${norm}`, 30 * 60_000, async () => {
    return fetchJson<WpPost[]>(
      `${KAIZEN_BASE}/wp-json/wp/v2/posts?search=${encodeURIComponent(title)}&per_page=8`,
      {},
      8000
    );
  });
  if (!Array.isArray(posts) || !posts.length) return null;
  let best: WpPost | null = null;
  let bestScore = 0;
  for (const p of posts) {
    const s = slugScore(normalize(p.slug), norm);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return bestScore >= 62 ? best : null;
}

/**
 * Look up the latest-episode player for `title` on animekaizen.org.
 * Returns null when no confident post match or no embeddable Blogger player.
 */
export async function kaizenLatest(title: string): Promise<KaizenHit | null> {
  try {
    const post = await findPost(title);
    if (!post) return null;
    const hit = await cached(`kaizen:post:${post.slug}`, 20 * 60_000, async () => {
      const html = await fetchText(post.link);
      const embed = extractBloggerEmbed(html);
      if (!embed) return null;
      const tm = /a4u-video-episode-title">([^<]{1,200})</.exec(html);
      const epTitle = tm ? tm[1].trim() : '';
      const { season, episode } = parseKaizenEpisodeTitle(epTitle);
      return { embed, epTitle, season, episode, slug: post.slug, postUrl: post.link } as KaizenHit;
    });
    return hit;
  } catch {
    return null;
  }
}
