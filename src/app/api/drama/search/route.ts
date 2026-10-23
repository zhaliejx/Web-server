import { NextResponse } from 'next/server';
import { cached } from '@/lib/ajest/upstream';
import { dramaSearch } from '@/lib/ajest/drama';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Drama search — /v1/drama/search via the dramacool SSR /search?q= page. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ ok: false, results: [], error: 'missing q' }, { status: 400 });
  try {
    const results = await cached(`drama:search:v1:${q.toLowerCase()}`, 10 * 60_000, () => dramaSearch(q));
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, results: [], error: e instanceof Error ? e.message : 'search failed' },
      { status: 200 }
    );
  }
}
