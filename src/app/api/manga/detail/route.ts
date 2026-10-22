import { NextResponse } from 'next/server';
import { cached } from '@/lib/ajest/upstream';
import { mangaDetail } from '@/lib/ajest/mangadex';
import { isPillMangaId, pillDetail } from '@/lib/ajest/mangapill';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const id = (new URL(req.url).searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });
  try {
    // Dispatch on the id namespace: mp: = MangaPill scrape, else MangaDex UUID
    const manga = isPillMangaId(id)
      ? await cached(`pill:detail:v1:${id}`, 10 * 60_000, () => pillDetail(id))
      : await cached(`manga:detail:v1:${id}`, 10 * 60_000, () => mangaDetail(id));
    return NextResponse.json({ ok: true, manga });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'detail failed' },
      { status: 200 }
    );
  }
}
