import { NextResponse } from 'next/server';
import {
  anilistCard,
  anilistQuery,
  ANILIST_CARD_FIELDS,
  aniZip,
  mergeAniZipEpisodes,
  kitsuById,
  kitsuSeasonal,
  currentSeason,
  cached,
  stripHtml,
} from '@/lib/ajest/upstream';
import { gogoCategory, slugCandidates } from '@/lib/ajest/gogo';
import type { AnimeCard, DetailPayload, EpisodeMeta } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DETAIL_QUERY = `
  query Detail($id: Int) {
    Media(id: $id, type: ANIME) {
      ${ANILIST_CARD_FIELDS}
      startDate { year month day }
      trailer { id site }
      streamingEpisodes { title thumbnail url site }
      nextAiringEpisode { episode airingAt }
      recommendations(perPage: 12, sort: RATING_DESC) {
        nodes { mediaRecommendation { ${ANILIST_CARD_FIELDS} } }
      }
    }
  }
`;

interface RawMedia {
  Media: Record<string, unknown> & {
    id: number;
    trailer?: { id: string; site: string } | null;
    streamingEpisodes?: { title?: string; thumbnail?: string; url?: string; site?: string }[];
    nextAiringEpisode?: { episode: number; airingAt: number } | null;
    recommendations?: { nodes: { mediaRecommendation?: Record<string, unknown> | null }[] };
  };
}

function episodesFromAnilist(m: RawMedia['Media'], durationMin: number): EpisodeMeta[] {
  const total = (m.episodes as number) || (m.streamingEpisodes?.length as number) || 0;
  const eps: EpisodeMeta[] = [];
  if (total && total > 0) {
    for (let i = 1; i <= total; i++) {
      const se = m.streamingEpisodes?.[i - 1];
      // AniList streamingEpisodes title format: "Episode N - Title"
      const t = se?.title?.replace(/^Episode\s*\d+\s*[-–]\s*/i, '');
      eps.push({
        number: i,
        title: se?.title ? t || `Episode ${i}` : `Episode ${i}`,
        durationMin: durationMin || 24,
        thumbnail: se?.thumbnail,
      });
    }
  }
  return eps;
}

// ── Kitsu detail path (with ani.zip enrichment) ─────────────────────────────
async function detailFromKitsu(kitsuId: number, malId?: number): Promise<DetailPayload | null> {
  const anime = await kitsuById(kitsuId);
  if (!anime) return null;

  // ani.zip accepts kitsu_id directly — also restores anilist/mal cross-ids
  const zip = malId
    ? await aniZip({ malId })
    : await aniZip({ kitsuId });
  if (zip?.mappings) {
    const mapMal = zip.mappings.mal_id ? parseInt(String(zip.mappings.mal_id), 10) : undefined;
    const mapAnilist = zip.mappings.anilist_id ? parseInt(String(zip.mappings.anilist_id), 10) : undefined;
    if (mapMal && !anime.malId) anime.malId = mapMal;
    if (mapAnilist && !anime.anilistId) anime.anilistId = mapAnilist;
  }

  const total = anime.episodes || zip?.episodeCount || 0;
  let eps: EpisodeMeta[] = [];
  if (total > 0) {
    for (let i = 1; i <= total; i++) {
      eps.push({ number: i, title: `Episode ${i}`, durationMin: anime.duration || 24 });
    }
  } else if (zip?.episodes.length) {
    eps = zip.episodes.map((e) => ({
      number: e.number,
      title: e.title || `Episode ${e.number}`,
      durationMin: e.runtimeMin || anime.duration || 24,
      thumbnail: e.thumbnail,
      airDate: e.airDateUtc?.slice(0, 10),
    }));
  }
  eps = mergeAniZipEpisodes(eps, zip);

  // Next-episode airtime for RELEASING shows (exact countdown without AniList)
  if (anime.status === 'RELEASING' && zip?.episodes.length) {
    const nowSec = Math.floor(Date.now() / 1000);
    const next = zip.episodes
      .map((e) => ({ n: e.number, at: e.airDateUtc ? Math.floor(new Date(e.airDateUtc).getTime() / 1000) : 0 }))
      .filter((e) => e.at > nowSec)
      .sort((a, b) => a.at - b.at)[0];
    if (next) {
      anime.nextEpisodeAt = next.at;
      anime.episodeNo = next.n;
    }
  }

  // Recommendations: popular current-season titles (Kitsu has per-title recs only via relationships)
  let recs: AnimeCard[] = [];
  try {
    const { season, year } = currentSeason();
    recs = (await kitsuSeasonal(season, year, 12)).slice(0, 12);
  } catch {
    /* optional */
  }
  return { anime, episodes: eps, recommendations: recs, trailer: null };
}

// ── gogoanime.by detail path (Tier 3 — direct scrape) ───────────────────────
async function detailFromGogo(title: string): Promise<DetailPayload | null> {
  const candidates = slugCandidates({ main: title, english: title });
  for (const slug of candidates.slice(0, 3)) {
    try {
      const series = await gogoCategory(slug);
      if (!series) continue;
      const epNums = Array.from(series.episodes.keys()).sort((a, b) => a - b);
      if (!epNums.length) continue;
      const eps: EpisodeMeta[] = epNums.map((n) => ({
        number: n,
        title: `Episode ${n}`,
        durationMin: 24,
      }));
      const card: AnimeCard = {
        id: `gogo:${slug}`,
        title: series.title,
        cover: series.poster || '',
        episodes: epNums[epNums.length - 1],
        description: series.synopsis,
        source: 'gogo',
      };
      return { anime: card, episodes: eps, recommendations: [], trailer: null };
    } catch {
      /* next slug */
    }
  }
  return null;
}

// ── Detail: AniList (+ani.zip) → Kitsu (via ani.zip mapping) → gogo scrape ──
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get('id') || '';
  const title = sp.get('title') || '';

  try {
    const payload = await cached(`detail:v4:${id}:${title}`, 5 * 60_000, async (): Promise<DetailPayload> => {
      // ── Resolve by AniList id ──────────────────────────────────────────────
      if (id.startsWith('anilist:')) {
        const anilistId = parseInt(id.split(':')[1], 10);
        try {
          const d = await anilistQuery<RawMedia>(DETAIL_QUERY, { id: anilistId }, 10000);
          const m = d.Media;
          const anime = { ...anilistCard(m as never), banner: (m as never as { bannerImage?: string }).bannerImage };
          const dur = anime.duration || 24;
          const baseEps = episodesFromAnilist(m as never, dur);
          // ani.zip per-episode enrichment: real runtime minutes, titles, thumbs
          const zip = await aniZip({ anilistId });
          const episodes = mergeAniZipEpisodes(baseEps, zip);
          const recs = (m.recommendations?.nodes || [])
            .map((n) => n.mediaRecommendation)
            .filter(Boolean)
            .map((r) => anilistCard(r as never));
          return {
            anime: {
              ...anime,
              nextEpisodeAt: m.nextAiringEpisode?.airingAt,
              description: stripHtml(anime.description),
            },
            episodes,
            recommendations: recs,
            trailer: m.trailer?.site === 'youtube' ? { id: m.trailer.id, site: 'youtube' } : null,
          };
        } catch {
          /* AniList outage → cross-map to Kitsu */
        }

        // ── AniList down: ani.zip gives us the kitsu/mal cross-mapping ───────
        try {
          const zip = await aniZip({ anilistId });
          const kitsuId = zip?.mappings?.kitsu_id ? parseInt(String(zip.mappings.kitsu_id), 10) : undefined;
          const malId = zip?.mappings?.mal_id ? parseInt(String(zip.mappings.mal_id), 10) : undefined;
          if (kitsuId) {
            const kd = await detailFromKitsu(kitsuId, malId);
            if (kd) return kd;
          }
        } catch {
          /* continue to gogo scrape */
        }

        // ── Tier 3: gogoanime.by scrape by title ────────────────────────────
        if (title) {
          const gd = await detailFromGogo(title);
          if (gd) return gd;
        }
      }

      // ── Resolve by Kitsu id ────────────────────────────────────────────────
      if (id.startsWith('kitsu:')) {
        const kitsuId = parseInt(id.split(':')[1], 10);
        const kd = await detailFromKitsu(kitsuId);
        if (kd) return kd;
      }

      // ── Resolve by gogo slug ───────────────────────────────────────────────
      if (id.startsWith('gogo:')) {
        const slug = id.split(':')[1];
        const series = await gogoCategory(slug);
        if (series) {
          const epNums = Array.from(series.episodes.keys()).sort((a, b) => a - b);
          const eps: EpisodeMeta[] = epNums.map((n) => ({
            number: n,
            title: `Episode ${n}`,
            durationMin: 24,
          }));
          return {
            anime: {
              id: `gogo:${slug}`,
              title: series.title,
              cover: series.poster || '',
              episodes: epNums[epNums.length - 1] || undefined,
              description: series.synopsis,
              source: 'gogo',
            },
            episodes: eps,
            recommendations: [],
            trailer: null,
          };
        }
      }

      // ── Cross-fallback by title (AniList down, no ids) ─────────────────────
      if (title) {
        const gd = await detailFromGogo(title);
        if (gd) return gd;
      }

      throw new Error('anime not found on any tier');
    });
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'detail failed' },
      { status: 200 }
    );
  }
}
