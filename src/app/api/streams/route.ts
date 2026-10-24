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
//   1. ani.pm verified-address embed (AniList id) — first in the chain
//   2. gogoanime.by direct scrape (slug guess → site search → relay search)
//   3. AnimeKaizen latest-episode mirror (Blogger embed)
//   4. official YouTube resolution (channel-whitelisted uploads)
//
// All lookups run CONCURRENTLY. The ani.pm embed needs zero network I/O (the
// URL is composed from the AniList id), so the response ships as soon as the
// source tiers settle or the deadline lands — metadata tiers (episode title,
// official links) get a short grace window and never hold playback hostage.
// With the default source set (ani.pm only) the resolver answers in ~0.5 s;
// an in-memory cache makes repeat episode opens instant.

const ALL_PROVIDERS = ['anipm', 'gogo', 'kaizen', 'youtube'] as const;
type Tier = (typeof ALL_PROVIDERS)[number];

/** Wall-clock cap for the SOURCE tiers before the response ships. */
const FAST_EXIT_MS = 2600;
/** Extra grace for source tiers that are still in flight at the deadline. */
const TIER_GRACE_MS = 700;
/** Metadata (episode title / official links) gets only this much grace —
 *  it never justifies delaying the player. */
const META_GRACE_MS = 450;

/** Repeat opens of the same episode resolve instantly. Direct-stream URLs
 *  stay valid well beyond this window; the ani.pm embed never expires. */
const CACHE_TTL = 10 * 60_000;
const streamsCache = new Map<string, { at: number; payload: StreamsPayload }>();

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
  const audio = sp.get('audio') === 'dub' ? 'dub' : 'sub';

  if (!main) {
    return NextResponse.json({ ok: false, sources: [], providersTried: [], error: 'missing title' });
  }

  // ── Instant cache hit ─────────────────────────────────────────────────────
  const cacheKey = [main, english || '', romaji || '', anilistId || '', malId || '', episode, audio, [...enabled].sort().join(',')].join('|');
  const hit = streamsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return NextResponse.json(hit.payload, { headers: { 'Cache-Control': 'no-store' } });
  }

  const bridgedAnilist = anilistId ? parseInt(anilistId, 10) : undefined;
  const bridgedMal = malId ? parseInt(malId, 10) : undefined;

  // ── Fire every independent lookup at once ─────────────────────────────────
  const zipP = budget(
    (bridgedAnilist || bridgedMal)
      ? aniZip({ anilistId: bridgedAnilist, malId: bridgedMal })
      : Promise.resolve(null as AniZipData | null),
    4500
  );

  const gogoP = enabled.has('gogo')
    ? budget(resolveGogoStreams({ main, english, romaji, native, episode }), 9000)
    : Promise.resolve(null);

  const ytP = enabled.has('youtube')
    ? budget(
        youtubeSearch(
          `${(english || romaji || main)
            .replace(/[''`]/g, '')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()} episode ${episode} english sub`,
          4500
        ).then((vids) => rankYoutubeEpisode(vids, english || romaji || main, episode)),
        4500
      )
    : Promise.resolve(null);

  const kzP = enabled.has('kaizen')
    ? budget(kaizenLatest(english || romaji || main), 4000)
    : Promise.resolve(null);

  // Trailer rides the same parallel window instead of a serial tail — it is
  // only ever included when nothing else materialized.
  const trailerP =
    enabled.has('youtube')
      ? budget(
          youtubeSearch(`official trailer ${english || romaji || main}`, 8000).then((vids) =>
            rankYoutubeTrailer(vids)
          ),
          8000
        ).catch(() => null)
      : Promise.resolve(null);

  const malP = budget(malSyncOfficialLinks({ anilistId: bridgedAnilist, malId: bridgedMal }), 4500);

  // ── Ship policy ───────────────────────────────────────────────────────────
  // Wait for the SOURCE tiers (gogo / kaizen / youtube / trailer) up to the
  // deadline, then give stragglers one short grace window. Metadata tiers are
  // collected on their own tighter grace so a slow MALSync call can never
  // hold the player past ~0.5 s when only the ani.pm tier is enabled.
  const sourceTiers = Promise.all([gogoP, ytP, kzP, trailerP] as const);
  let deadlineHit = false;
  await Promise.race([
    sourceTiers,
    new Promise<null>((r) =>
      setTimeout(() => {
        deadlineHit = true;
        r(null);
      }, FAST_EXIT_MS)
    ),
  ]);
  const [resolved, ytHit, kz, trailer] = deadlineHit
    ? await Promise.all([budget(gogoP, TIER_GRACE_MS), budget(ytP, TIER_GRACE_MS), budget(kzP, TIER_GRACE_MS), budget(trailerP, TIER_GRACE_MS)])
    : await sourceTiers;
  const [zip, officialLinks] = await Promise.all([budget(zipP, META_GRACE_MS), budget(malP, META_GRACE_MS)]);

  // ── Compose the ordered fallback chain ────────────────────────────────────
  const sources: VideoSource[] = [];

  // 1. ani.pm verified-address embed — chain-first. Partner player with
  //    `frame-ancestors *`; episode numbering matches AniList. Its Cloudflare
  //    blocks Node TLS fingerprints, so the server ships the URL blind and the
  //    Player verifies availability from the browser via the CORS-open partner
  //    API (auto-switches to the next tier on a confirmed miss).
  if (bridgedAnilist && enabled.has('anipm')) {
    sources.push({
      provider: 'anipm',
      url: `embed:${aniPmEmbedUrl(bridgedAnilist, episode, audio)}`,
      quality: 'auto',
      isM3U8: false,
      note:
        audio === 'dub'
          ? 'Full episode · dub (falls back to sub when unavailable)'
          : 'Full episode · sub (dub switchable in player)',
    });
  }

  // 2. gogo direct files (native Ajest controls when they play)
  if (resolved?.sources?.length) {
    for (const s of resolved.sources) {
      sources.push({ ...s, url: proxied(s.url) });
    }
  }

  // 3. AnimeKaizen latest-episode mirror (Blogger-hosted, episode-matched)
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

  // 4. official YouTube full episode
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

  // Trailer as clearly-labeled last resort (official channels only)
  if (trailer && (!sources.length || sources.every((s) => s.provider.startsWith('gogo-')))) {
    sources.push({
      provider: 'youtube-trailer',
      url: `youtube:${trailer.videoId}`,
      quality: 'trailer',
      isM3U8: false,
      note: `Official trailer · ${trailer.channel}`,
    });
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
  streamsCache.set(cacheKey, { at: Date.now(), payload });
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
