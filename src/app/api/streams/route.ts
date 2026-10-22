import { NextResponse } from 'next/server';
import {
  aniZip,
  malSyncOfficialLinks,
  youtubeSearch,
  rankYoutubeEpisode,
  rankYoutubeTrailer,
} from '@/lib/ajest/upstream';
import type { AniZipData } from '@/lib/ajest/upstream';
import { resolveGogoStreams } from '@/lib/ajest/gogo';
import { kaizenLatest } from '@/lib/ajest/kaizen';
import type { StreamsPayload, VideoSource } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Stream resolution (verified live chain) ──────────────────────────────────
//   1. gogoanime.by direct scrape (slug guess → site search → relay search)
//   2. official YouTube resolution (channel-whitelisted uploads)
// Every source URL is returned wrapped for /api/proxy — the stream URLs are
// signed to OUR server IP, so the Next.js server must pipe the bytes with
// Range support (that also removes any CORS concern).

function proxied(url: string): string {
  return `/api/proxy?u=${encodeURIComponent(url)}`;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const main = sp.get('title') || '';
  const english = sp.get('titleEnglish') || undefined;
  const romaji = sp.get('titleRomaji') || undefined;
  const native = sp.get('titleNative') || undefined;
  const anilistId = sp.get('anilistId');
  const malId = sp.get('malId');
  const episode = Math.max(1, parseInt(sp.get('episode') || '1', 10) || 1);

  if (!main) {
    return NextResponse.json({ ok: false, sources: [], providersTried: [], error: 'missing title' });
  }

  // Look up the canonical episode title (ani.zip per-episode metadata)
  let episodeTitle: string | undefined;
  let zip: AniZipData | null = null;
  let bridgedAnilist = anilistId ? parseInt(anilistId, 10) : undefined;
  let bridgedMal = malId ? parseInt(malId, 10) : undefined;
  if (bridgedAnilist || bridgedMal) {
    zip = await aniZip({ anilistId: bridgedAnilist, malId: bridgedMal });
    episodeTitle = zip?.episodes.find((e) => e.number === episode)?.title;
    // Bridge missing ids from ani.zip mappings (works even with AniList down)
    if (zip?.mappings) {
      if (!bridgedAnilist && zip.mappings.anilist_id) bridgedAnilist = parseInt(String(zip.mappings.anilist_id), 10);
      if (!bridgedMal && zip.mappings.mal_id) bridgedMal = parseInt(String(zip.mappings.mal_id), 10);
    }
  }

  try {
    const resolved = await resolveGogoStreams({ main, english, romaji, native, episode });

    const sources: VideoSource[] = resolved.sources.map((s) => ({
      ...s,
      url: proxied(s.url),
    }));

    // Real official watch destinations (MALSync) — shown when a scrape fails
    const officialLinks = await malSyncOfficialLinks({ anilistId: bridgedAnilist, malId: bridgedMal });

    // ── Official YouTube resolution (always in the chain) ──────────────────
    // gogo googlevideo MP4s are signed to source-infra IPs and cannot play in
    // a browser; official channel uploads (Muse Asia, Ani-One…) can. Gogo
    // sources stay first — if the deployment IP happens to match they play,
    // otherwise the <video> error fires in ~1s and the player falls through.
    const cleanTitle = (english || romaji || main)
      .replace(/[''`]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const q = `${cleanTitle} episode ${episode} english sub`;
    try {
      const vids = await youtubeSearch(q, 10000);
      const hit = rankYoutubeEpisode(vids, english || romaji || main, episode);
      if (hit) {
        sources.push({
          provider: hit.official ? 'youtube-official' : 'youtube-full',
          url: `youtube:${hit.video.videoId}`,
          quality: 'full',
          isM3U8: false,
          note: hit.official
            ? `Official full episode · ${hit.video.channel}`
            : `Full episode · ${hit.video.channel}`,
        });
      }
    } catch {
      /* youtube unreachable → next */
    }
    // ── VidLink universal embed (TMDB-addressed) — catalog-wide coverage ───
    // gogoanime.by only hosts a slice of shows; VidLink is a multi-server
    // aggregator built for iframe embedding that covers effectively every
    // anime through its TMDB id (ani.zip bridges anilist → themoviedb_id).
    // It carries its own player UI, so the Player renders it as an embed.
    const zep = zip?.episodes.find((e) => e.number === episode);
    if (zip?.tmdbId) {
      const season = zep?.seasonNumber ?? 1;
      sources.push({
        provider: 'vidlink',
        url: `embed:https://vidlink.pro/tv/${zip.tmdbId}/${season}/${episode}`,
        quality: 'auto',
        isM3U8: false,
        note: 'Universal multi-server player',
      });
    }

    // ── AnimeKaizen latest-episode mirror (Blogger-hosted) ──────────────────
    // animekaizen.org is a WordPress catalog where each anime post embeds the
    // latest episode on Google's Blogger CDN (no X-Frame-Options → embeddable,
    // same client-side pattern as VidLink). Its googlevideo URLs are IP-locked
    // so the iframe must run in the user's browser. A post carries exactly one
    // episode — we parse its title and only offer the source when it matches
    // the requested episode, never serving the wrong content.
    try {
      const kz = await kaizenLatest(english || romaji || main);
      if (kz) {
        // Kaizen's season labels follow their own split, not ani.zip/TMDB
        // numbering — so only the episode number is trusted here. The note
        // always shows the exact episode title the mirror claims to carry.
        const epOk = kz.episode === null || kz.episode === episode;
        if (epOk) {
          sources.push({
            provider: 'kaizen',
            url: `embed:${kz.embed}`,
            quality: 'auto',
            isM3U8: false,
            note: kz.epTitle ? `Latest-episode mirror · ${kz.epTitle.slice(0, 80)}` : 'Latest-episode mirror',
          });
        }
      }
    } catch {
      /* kaizen unreachable → next */
    }

    // Trailer as clearly-labeled last resort (official channels only)
    if (!sources.length || sources.every((s) => s.provider.startsWith('gogo-'))) {
      try {
        const tvids = await youtubeSearch(`official trailer ${english || romaji || main}`, 9000);
        const tr = rankYoutubeTrailer(tvids);
        if (tr) {
          sources.push({
            provider: 'youtube-trailer',
            url: `youtube:${tr.videoId}`,
            quality: 'trailer',
            isM3U8: false,
            note: `Official trailer · ${tr.channel}`,
          });
        }
      } catch {
        /* youtube unreachable */
      }
    }

    const payload: StreamsPayload = {
      ok: sources.length > 0,
      sources,
      providersTried: resolved.steps.map((s) => ({ provider: s.provider, ok: s.ok, error: s.error })),
      episodeTitle: episodeTitle || resolved.episodeTitle,
      officialLinks,
    };
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const officialLinks = await malSyncOfficialLinks({ anilistId: bridgedAnilist, malId: bridgedMal });
    const payload: StreamsPayload = {
      ok: false,
      sources: [],
      providersTried: [{ provider: 'gogo-by', ok: false, error: (e as Error).message?.slice(0, 80) }],
      officialLinks,
    };
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  }
}
