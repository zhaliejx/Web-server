import { NextResponse } from 'next/server';
import {
  anilistCard,
  anilistQuery,
  ANILIST_CARD_FIELDS,
  cached,
  currentSeason,
  kitsuTrending,
  kitsuSeasonal,
  kitsuPopular,
  kitsuByCategory,
} from '@/lib/ajest/upstream';
import type { AniListRaw } from '@/lib/ajest/upstream';
import type { AnimeCard } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HOME_QUERY = `
  query Home($season: MediaSeason, $seasonYear: Int, $nextSeason: MediaSeason, $nextYear: Int) {
    trending: Page(page: 1, perPage: 20) {
      media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${ANILIST_CARD_FIELDS} }
    }
    seasonal: Page(page: 1, perPage: 20) {
      media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC, isAdult: false) { ${ANILIST_CARD_FIELDS} }
    }
    upcoming: Page(page: 1, perPage: 20) {
      media(type: ANIME, season: $nextSeason, seasonYear: $nextYear, sort: POPULARITY_DESC, isAdult: false) { ${ANILIST_CARD_FIELDS} }
    }
    topRated: Page(page: 1, perPage: 20) {
      media(type: ANIME, sort: SCORE_DESC, isAdult: false) { ${ANILIST_CARD_FIELDS} }
    }
    action: Page(page: 1, perPage: 20) {
      media(type: ANIME, genre: "Action", sort: TRENDING_DESC, isAdult: false) { ${ANILIST_CARD_FIELDS} }
    }
    fantasy: Page(page: 1, perPage: 20) {
      media(type: ANIME, genre: "Fantasy", sort: TRENDING_DESC, isAdult: false) { ${ANILIST_CARD_FIELDS} }
    }
    romance: Page(page: 1, perPage: 20) {
      media(type: ANIME, genre: "Romance", sort: TRENDING_DESC, isAdult: false) { ${ANILIST_CARD_FIELDS} }
    }
  }
`;

interface PageResp {
  media: AniListRaw[];
}

// ── Tier 2 fallback: Kitsu (live JSON:API) ──────────────────────────────────
async function kitsuFallbackHome(): Promise<Record<string, AnimeCard[]>> {
  const { season, year, nextSeason, nextYear } = currentSeason();
  const [trending, seasonal, upcoming, topRated, action, fantasy, romance] = await Promise.allSettled([
    kitsuTrending(20),
    kitsuSeasonal(season, year, 20),
    kitsuSeasonal(nextSeason, nextYear, 20, true),
    kitsuPopular(20),
    kitsuByCategory('action', 20),
    kitsuByCategory('fantasy', 20),
    kitsuByCategory('romance', 20),
  ]);
  return {
    trending: trending.status === 'fulfilled' ? trending.value : [],
    seasonal: seasonal.status === 'fulfilled' ? seasonal.value : [],
    upcoming: upcoming.status === 'fulfilled' ? upcoming.value.filter((a) => a.status === 'NOT_YET_RELEASED' || !a.status) : [],
    topRated: topRated.status === 'fulfilled' ? topRated.value : [],
    action: action.status === 'fulfilled' ? action.value : [],
    fantasy: fantasy.status === 'fulfilled' ? fantasy.value : [],
    romance: romance.status === 'fulfilled' ? romance.value : [],
  };
}

// ── Catalog: AniList → Kitsu, zero-missing-content guarantee ────────────────
export async function GET() {
  try {
    const data = await cached('home:v5', 5 * 60_000, async () => {
      const { season, year, nextSeason, nextYear } = currentSeason();
      try {
        const d = await anilistQuery<Record<string, PageResp>>(
          HOME_QUERY,
          { season, seasonYear: year, nextSeason, nextYear },
          12000
        );
        const sections = {
          trending: d.trending.media.filter(Boolean).map(anilistCard),
          seasonal: d.seasonal.media.filter(Boolean).map(anilistCard),
          upcoming: d.upcoming.media.filter(Boolean).map(anilistCard),
          topRated: d.topRated.media.filter(Boolean).map(anilistCard),
          action: d.action.media.filter(Boolean).map(anilistCard),
          fantasy: d.fantasy.media.filter(Boolean).map(anilistCard),
          romance: d.romance.media.filter(Boolean).map(anilistCard),
        } as Record<string, AnimeCard[]>;
        // AniList can return 200 with empty sections during partial incidents
        if (sections.trending.length || sections.seasonal.length) {
          return { tier: 'anilist', sections };
        }
        throw new Error('anilist sections empty');
      } catch {
        // Tier 2 fallback: Kitsu (independent network path)
        return { tier: 'kitsu', sections: await kitsuFallbackHome() };
      }
    });
    return NextResponse.json({ ok: true, tier: data.tier, sections: data.sections });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'catalog failed', sections: {} },
      { status: 200 }
    );
  }
}
