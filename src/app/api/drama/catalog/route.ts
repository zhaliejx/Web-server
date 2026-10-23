import { NextResponse } from 'next/server';
import { cached } from '@/lib/ajest/upstream';
import { dramaHome } from '@/lib/ajest/drama';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Drama home catalog — named sections from the dramacool SSR homepage. */
export async function GET() {
  try {
    const data = await cached('drama:home:v1', 15 * 60_000, () => dramaHome());
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, sections: [], error: e instanceof Error ? e.message : 'catalog failed' },
      { status: 200 }
    );
  }
}
