import { NextResponse } from 'next/server';
import { cached } from '@/lib/ajest/upstream';
import { mangaFeed } from '@/lib/ajest/mangadex';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const id = (new URL(req.url).searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });
  try {
    // Short TTL — new chapters should surface quickly
    const chapters = await cached(`manga:feed:v1:${id}`, 2 * 60_000, () => mangaFeed(id));
    return NextResponse.json({ ok: true, chapters });
  } catch (e) {
    return NextResponse.json(
      { ok: false, chapters: [], error: e instanceof Error ? e.message : 'feed failed' },
      { status: 200 }
    );
  }
}
