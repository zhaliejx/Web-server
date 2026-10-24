import { NextResponse } from 'next/server';
import { dramaStreams } from '@/lib/ajest/drama';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Episode sources — direct HLS (when pre-resolved upstream) + hoster embeds +
 *  MyAsianTV mirror. Same VideoSource shape as /api/streams. The `providers`
 *  param carries the client's drama source toggles so disabled tiers are
 *  never contacted (and resolution stays fast). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const slug = (sp.get('slug') || '').trim();
  const episode = Math.max(1, parseFloat(sp.get('episode') || '1') || 1);
  if (!slug) return NextResponse.json({ ok: false, sources: [], providersTried: [], error: 'missing slug' }, { status: 400 });
  const providers = (sp.get('providers') || '').split(',').map((p) => p.trim()).filter(Boolean);
  try {
    const r = await dramaStreams(slug, episode, providers.length ? { providers } : {});
    return NextResponse.json({ ok: r.sources.length > 0, ...r });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        sources: [],
        providersTried: [{ provider: 'dramacool', ok: false, error: e instanceof Error ? e.message.slice(0, 60) : 'streams failed' }],
      },
      { status: 200 }
    );
  }
}
