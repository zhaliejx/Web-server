import { NextResponse } from 'next/server';
import { mangaChaptersResolved } from '@/lib/ajest/mangafallback';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const id = (new URL(req.url).searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });
  try {
    // Resolves across tiers: MangaDex feed → WeebCentral → MangaPill when a
    // series has no readable EN chapters on MD (licensed/external-only).
    const chapters = await mangaChaptersResolved(id);
    return NextResponse.json({ ok: true, chapters });
  } catch (e) {
    return NextResponse.json(
      { ok: false, chapters: [], error: e instanceof Error ? e.message : 'feed failed' },
      { status: 200 }
    );
  }
}
