import { NextResponse } from 'next/server';
import { cached } from '@/lib/ajest/upstream';
import { mangaList } from '@/lib/ajest/mangadex';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ ok: true, results: [] });
  try {
    const results = await cached(`manga:search:v1:${q.toLowerCase()}`, 3 * 60_000, () =>
      mangaList({ title: q, 'order[relevance]': 'desc' }, 24)
    );
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, results: [], error: e instanceof Error ? e.message : 'search failed' },
      { status: 200 }
    );
  }
}
