import { NextResponse } from 'next/server';
import {
  anilistCard,
  anilistQuery,
  ANILIST_CARD_FIELDS,
  cached,
  kitsuSearch,
  fetchJson,
} from '@/lib/ajest/upstream';
import { gogoSearchSlugs, gogoCategory } from '@/lib/ajest/gogo';
import type { AnimeCard } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SEARCH_QUERY = `
  query Search($search: String) {
    Page(page: 1, perPage: 30) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${ANILIST_CARD_FIELDS} }
    }
  }
`;

// ── Tier 3: gogoanime.by direct scrape (site search → category cards) ───────
async function gogoSearchCards(q: string): Promise<AnimeCard[]> {
  const slugs = await gogoSearchSlugs(q);
  // Validate the top slugs in parallel and build cards from category pages
  const top = slugs.slice(0, 10);
  const settled = await Promise.allSettled(top.map((s) => gogoCategory(s)));
  const cards: AnimeCard[] = [];
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value) return;
    const series = r.value;
    const epCount = Math.max(series.episodes.size, series.dubEpisodes.size) || undefined;
    cards.push({
      id: `gogo:${top[i]}`,
      title: series.title,
      cover: series.poster || '',
      episodes: epCount,
      description: series.synopsis,
      source: 'gogo',
    });
  });
  return cards;
}

// ── Triple-tier search: AniList → Kitsu → gogoanime.by scrape ───────────────
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ tier: 'none', results: [] });

  try {
    const results = await cached(`search:v4:${q.toLowerCase()}`, 5 * 60_000, async (): Promise<{ tier: string; results: AnimeCard[] }> => {
      // Tier 1 — AniList GraphQL
      try {
        const d = await anilistQuery<{ Page: { media: Record<string, unknown>[] } }>(
          SEARCH_QUERY,
          { search: q },
          9000
        );
        const media = d.Page.media.filter(Boolean).map((m) => anilistCard(m as never));
        if (media.length) return { tier: 'anilist', results: media };
      } catch {
        /* Tier 1 down → next */
      }

      // Tier 2 — Kitsu JSON:API
      try {
        const kitsu = await kitsuSearch(q, 24);
        if (kitsu.length) return { tier: 'kitsu', results: kitsu };
      } catch (e) {
        console.error('[search] kitsu tier failed:', (e as Error).message);
        /* Tier 2 down → next */
      }

      // Tier 3 — gogoanime.by direct scrape
      const gogo = await gogoSearchCards(q);
      if (gogo.length) return { tier: 'gogo', results: gogo };

      return { tier: 'none', results: [] };
    });
    return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { tier: 'error', results: [], error: e instanceof Error ? e.message : 'search failed' },
      { status: 200 }
    );
  }
}
