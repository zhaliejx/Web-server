import { NextResponse } from 'next/server';
import { anilistCard, anilistQuery, ANILIST_CARD_FIELDS, cached } from '@/lib/ajest/upstream';
import {
  ANILIST_SORTS,
  BROWSE_GENRES,
  BROWSE_THEMES,
  isBrowseSort,
} from '@/lib/ajest/genres';
import type { AniListRaw } from '@/lib/ajest/upstream';
import type { AnimeCard } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Browse: full-catalog listing with genre/theme filters + sorting ─────────
// AniList Page.media natively supports genre_in / tag_in / sort / paging, so
// "list EVERY anime matching the filters" is one upstream query per page —
// no crawling, no relay. Kitsu (tier 2) has no comparable tag system, so
// browse is AniList-only by design; the UI surfaces a clean retry on failure.

const BROWSE_QUERY = `
  query Browse($page: Int, $perPage: Int, $genres: [String], $tags: [String], $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage }
      media(type: ANIME, isAdult: false, genre_in: $genres, tag_in: $tags, sort: $sort) {
        ${ANILIST_CARD_FIELDS}
      }
    }
  }
`;

interface PageInfo {
  total: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
}

const PER_PAGE = 36;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;

  // Allowlist enforcement — unknown values are dropped, never forwarded
  const genres = (sp.get('genres') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is (typeof BROWSE_GENRES)[number] =>
      (BROWSE_GENRES as readonly string[]).includes(s)
    );
  const tags = (sp.get('tags') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is (typeof BROWSE_THEMES)[number] =>
      (BROWSE_THEMES as readonly string[]).includes(s)
    );
  const sortParam = sp.get('sort') || 'trending';
  const sort = isBrowseSort(sortParam) ? sortParam : 'trending';
  const page = Math.min(500, Math.max(1, parseInt(sp.get('page') || '1', 10) || 1));

  const cacheKey = `browse:v1:${sort}:${genres.join('+')}:${tags.join('+')}:p${page}`;
  try {
    const data = await cached(cacheKey, 5 * 60_000, async () => {
      const d = await anilistQuery<{
        Page: { pageInfo: PageInfo; media: (AniListRaw | null)[] };
      }>(
        BROWSE_QUERY,
        {
          page,
          perPage: PER_PAGE,
          // Empty filters are omitted — AniList treats absent as "all"
          ...(genres.length ? { genres } : {}),
          ...(tags.length ? { tags } : {}),
          sort: ANILIST_SORTS[sort],
        },
        11000
      );
      const items = d.Page.media.filter((m): m is AniListRaw => !!m).map(anilistCard);
      if (!items.length && page === 1) throw new Error('browse empty');
      return { items, pageInfo: d.Page.pageInfo };
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        items: [] as AnimeCard[],
        pageInfo: { total: 0, currentPage: page, lastPage: 0, hasNextPage: false },
        error: e instanceof Error ? e.message : 'browse failed',
      },
      { status: 200 }
    );
  }
}
