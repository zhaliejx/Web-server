import { NextResponse } from 'next/server';
import { cached } from '@/lib/ajest/upstream';
import { dramaDetail } from '@/lib/ajest/drama';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Series detail — metadata + full episode list (SSR hrefs, handles long shows). */
export async function GET(req: Request) {
  const slug = (new URL(req.url).searchParams.get('slug') || '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'missing slug' }, { status: 400 });
  try {
    const detail = await cached(`drama:detail:v1:${slug}`, 10 * 60_000, () => dramaDetail(slug));
    return NextResponse.json({ ok: true, ...detail });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'detail failed' },
      { status: 200 }
    );
  }
}
