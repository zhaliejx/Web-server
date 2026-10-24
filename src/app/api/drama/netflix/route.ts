import { NextResponse } from 'next/server';
import { resolveNetflixTitle } from '@/lib/ajest/netflix';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Resolve one Netflix-exclusives catalog title against the live dramacool
 *  search. `GET /api/drama/netflix?resolve=Squid Game&year=2021`
 *  → `{ ok, item: DramaItem | null }` — null = no confident match (cached). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const title = (sp.get('resolve') || '').trim();
  const yearRaw = parseInt(sp.get('year') || '', 10);
  const year = Number.isFinite(yearRaw) && yearRaw > 1900 ? yearRaw : undefined;
  if (!title) {
    return NextResponse.json({ ok: false, error: 'resolve title required' }, { status: 400 });
  }
  try {
    const item = await resolveNetflixTitle(title, year);
    return NextResponse.json({ ok: true, item: item || null });
  } catch (e) {
    return NextResponse.json(
      { ok: false, item: null, error: e instanceof Error ? e.message : 'resolve failed' },
      { status: 200 }
    );
  }
}
