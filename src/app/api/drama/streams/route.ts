import { NextResponse } from 'next/server';
import { dramaStreams } from '@/lib/ajest/drama';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Episode sources — direct HLS (when pre-resolved upstream) + hoster embeds +
 *  MyAsianTV mirror + YouTube official uploads, plus a Viki official-link chip.
 *  Same VideoSource shape as /api/streams. The `providers` param carries the
 *  client's drama source toggles so disabled tiers are never contacted (and
 *  resolution stays fast); `title` unlocks the parallel side-tier fast path. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const slug = (sp.get('slug') || '').trim();
  const episode = Math.max(1, parseFloat(sp.get('episode') || '1') || 1);
  if (!slug) return NextResponse.json({ ok: false, sources: [], providersTried: [], error: 'missing slug' }, { status: 400 });
  const providers = (sp.get('providers') || '').split(',').map((p) => p.trim()).filter(Boolean);
  // Display title from the client — lets the YouTube / Viki side-tiers resolve
  // in parallel with the dramacool watch-page fetch instead of after it.
  const title = (sp.get('title') || '').trim();
  try {
    const r = await dramaStreams(slug, episode, {
      providers: providers.length ? providers : undefined,
      title: title || undefined,
    });
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
