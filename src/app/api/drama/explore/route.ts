import { NextResponse } from 'next/server';
import { cached } from '@/lib/ajest/upstream';
import { dramaExplore } from '@/lib/ajest/drama';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Drama Explore — filtered + sorted + paged full-catalog listing
 *  (dramacool /explore SSR page → /v1/drama/list, 30 items per page). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const f = {
    country: sp.get('country') || undefined,
    genre: sp.get('genre') || undefined,
    status: sp.get('status') || undefined,
    type: sp.get('type') || undefined,
    year: sp.get('year') || undefined,
    sort: sp.get('sort') || 'most_popular',
    page: Math.max(1, parseInt(sp.get('page') || '1', 10) || 1),
  };
  const key = `drama:explore:v1:${f.country || '-'}:${f.genre || '-'}:${f.status || '-'}:${f.type || '-'}:${f.year || '-'}:${f.sort}:${f.page}`;
  try {
    const data = await cached(key, 8 * 60_000, () => dramaExplore(f));
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        items: [],
        pageInfo: { total: 0, currentPage: f.page, totalPages: 0, hasNext: false },
        error: e instanceof Error ? e.message : 'explore failed',
      },
      { status: 200 }
    );
  }
}
