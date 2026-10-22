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
import { aniPmEmbedUrl } from '@/lib/ajest/anipm';
import type { StreamsPayload, VideoSource } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Stream resolution (parallel tiers) ───────────────────────────────────────
//   1. gogoanime.by direct scrape (slug guess → site search → relay search)
//   2. official YouTube resolution (channel-whitelisted uploads)
//   3. ani.pm verified-address embed (AniList id)
//   4. VidLink universal embed (TMDB id via ani.zip)
//   5. AnimeKaizen latest-episode mirror (Blogger embed)
//
// All independent lookups run CONCURRENTLY with per-tier time budgets —
// response time ≈ slowest enabled tier instead of the serial sum. The
// `providers` param (client source toggles) skips tiers entirely, which
// shortens both the work and the wall clock.

const ALL_PROVIDERS = ['gogo', 'youtube', 'anipm', 'vidlink', 'kaizen'] as const;
type Tier = (typeof ALL_PROVIDERS)[number];

/** Overall wall-clock cap before the response ships with whatever settled. */
const FAST_EXIT_MS = 4500;

/** Resolve a promise within a time budget; null on timeout or rejection. */
function budget<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, ms);
    p.then(
      (v) => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(v);
        }
      },
      () => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(null);
        }
      }
    );
  });
}

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

  // Client source toggles — disabled tiers are never contacted
  const enabledParam = sp.get('providers');
  const enabled = new Set<Tier>(
    enabledParam
      ? (enabledParam.split(',').filter((p) => (ALL_PROVIDERS as readonly string[]).includes(p)) as Tier[])
      : ALL_PROVIDERS
  );
  if (enabled.size === 0) ALL_PROVIDERS.forEach((p) => enabled.add(p));

  if (!main) {
    return NextResponse.json({ ok: false, sources: [], providersTried: [], error: 'missing title' });
  }

  const bridgedAnilist = anilistId ? parseInt(anilistId, 10) : undefined;
  const bridgedMal = malId ? parseInt(malId, 10) : undefined;

  // ── Fire every independent lookup at once ─────────────────────────────────
  // ani.zip also feeds the episode title shown in the player, so it runs
  // whenever we have any id — it's a single cheap call inside the parallel
  // window either way.
  const zipP = budget(
    (bridgedAnilist || bridgedMal)
      ? aniZip({ anilistId: bridgedAnilist, malId: bridgedMal })
      : Promise.resolve(null as AniZipData | null),
    4500
  );

  const gogoP = enabled.has('gogo')
    ? budget(resolveGogoStreams({ main, english, romaji, native, episode }), 10000)
    : Promise.resolve(null);

  const ytP = enabled.has('youtube')
    ? budget(
        youtubeSearch(
          `${(english || romaji || main)
            .replace(/[''`]/g, '')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()} episode ${episode} english sub`,
          5000
        ).then((vids) => rankYoutubeEpisode(vids, english || romaji || main, episode)),
        5500
      )
    : Promise.resolve(null);

  const kzP = enabled.has('kaizen')
    ? budget(kaizenLatest(english || romaji || main), 5000)
    : Promise.resolve(null);

  const malP = budget(malSyncOfficialLinks({ anilistId: bridgedAnilist, malId: bridgedMal }), 4500);

  // ── Fast-exit ─────────────────────────────────────────────────────────
  // All tiers race in parallel, but the response doesn't have to wait for
  // every straggler: ani.pm + VidLink embeds are ready almost instantly, so
  // after FAST_EXIT_MS we collect whatever finished and give stragglers a
  // short grace window. A 13s gogo scrape can no longer hold the response
  // hostage — the player auto-falls to the embed tiers instead.
  const allTiers = Promise.all([zipP, gogoP, ytP, kzP, malP] as const);
  let fastExit = false;
  await Promise.race([
    allTiers,
    new Promise<null>((r) =>
      setTimeout(() => {
        fastExit = true;
        r(null);
      }, FAST_EXIT_MS)
    ),
  ]);
  const [zip, resolved, ytHit, kz, officialLinks] = fastExit
    ? await Promise.all([budget(zipP, 800), budget(gogoP, 800), budget(ytP, 1000), budget(kzP, 800), budget(malP, 500)])
    : await allTiers;

  // ── Compose the ordered fallback chain ────────────────────────────────────
  const sources: VideoSource[] = [];

  // 1. gogo direct files (native Ajest controls when they play)
  if (resolved?.sources?.length) {
    for (const s of resolved.sources) {
      sources.push({ ...s, url: proxied(s.url) });
    }
  }

  // 2. official YouTube full episode
  if (ytHit) {
    sources.push({
      provider: ytHit.official ? 'youtube-official' : 'youtube-full',
      url: `youtube:${ytHit.video.videoId}`,
      quality: 'full',
      isM3U8: false,
      note: ytHit.official
        ? `Official full episode · ${ytHit.video.channel}`
        : `Full episode · ${ytHit.video.channel}`,
    });
  }

  // 3. ani.pm verified-address embed — partner player with `frame-ancestors *`;
  //    episode numbering matches AniList. Its Cloudflare blocks Node TLS
  //    fingerprints, so the server ships the URL blind and the Player
  //    verifies availability from the browser via the CORS-open partner API.
  if (bridgedAnilist && enabled.has('anipm')) {
    sources.push({
      provider: 'anipm',
      url: `embed:${aniPmEmbedUrl(bridgedAnilist, episode, 'sub')}`,
      quality: 'auto',
      isM3U8: false,
      note: 'Full episode · sub (dub switchable in player)',
    });
  }

  // 4. VidLink universal embed (TMDB-addressed) — catalog-wide coverage
  const zep = zip?.episodes.find((e) => e.number === episode);
  if (zip?.tmdbId && enabled.has('vidlink')) {
    const season = zep?.seasonNumber ?? 1;
    sources.push({
      provider: 'vidlink',
      url: `embed:https://vidlink.pro/tv/${zip.tmdbId}/${season}/${episode}`,
      quality: 'auto',
      isM3U8: false,
      note: 'Universal multi-server player',
    });
  }

  // 5. AnimeKaizen latest-episode mirror (Blogger-hosted, episode-matched)
  if (kz) {
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

  // Trailer as clearly-labeled last resort (official channels only)
  if (enabled.has('youtube') && (!sources.length || sources.every((s) => s.provider.startsWith('gogo-')))) {
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

  const episodeTitle = zip?.episodes.find((e) => e.number === episode)?.title || resolved?.episodeTitle;
  const providersTried = resolved?.steps.map((s) => ({ provider: s.provider, ok: s.ok, error: s.error })) ?? [];

  const payload: StreamsPayload = {
    ok: sources.length > 0,
    sources,
    providersTried,
    episodeTitle: episodeTitle || undefined,
    officialLinks: officialLinks ?? undefined,
  };
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
