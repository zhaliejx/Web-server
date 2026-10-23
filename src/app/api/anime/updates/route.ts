import { NextResponse } from 'next/server';
import { anilistQuery, cached } from '@/lib/ajest/upstream';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Updates: aired-episode counts for the new-episode radar ─────────────────
// One AniList round-trip answers "how many episodes are out RIGHT NOW" for up
// to 24 titles. The client compares each number against the episode stored in
// History: finished shows use `episodes`; airing shows use
// nextAiringEpisode.episode − 1 (episodes that already aired).
//
//   GET /api/anime/updates?ids=anilist:21,anilist:1535
//   → { ok, counts: { "anilist:21": 1180, "anilist:1535": 37 } }
//
// `null` aired = unknown (not yet announced) — the client never badges those.

const UPDATES_QUERY = `
  query Updates($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        episodes
        nextAiringEpisode { episode }
      }
    }
  }
`;

interface RawUpdate {
  id: number;
  episodes?: number | null;
  nextAiringEpisode?: { episode: number } | null;
}

const MAX_IDS = 24;

export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^anilist:\d+$/.test(s))
    .slice(0, MAX_IDS);

  if (!ids.length) {
    return NextResponse.json({ ok: true, counts: {} });
  }

  const numeric = ids.map((s) => parseInt(s.split(':')[1], 10));
  const cacheKey = `updates:v1:${ids.join('+')}`;
  try {
    const counts = await cached(cacheKey, 10 * 60_000, async () => {
      const d = await anilistQuery<{ Page: { media: RawUpdate[] } }>(
        UPDATES_QUERY,
        { ids: numeric },
        10000
      );
      const out: Record<string, number | null> = {};
      for (const s of ids) out[s] = null;
      for (const m of d.Page.media) {
        const aired =
          m.episodes ?? (m.nextAiringEpisode?.episode ? m.nextAiringEpisode.episode - 1 : null);
        out[`anilist:${m.id}`] = aired ?? null;
      }
      return out;
    });
    return NextResponse.json({ ok: true, counts });
  } catch (e) {
    return NextResponse.json(
      { ok: false, counts: {}, error: e instanceof Error ? e.message : 'updates failed' },
      { status: 200 }
    );
  }
}
