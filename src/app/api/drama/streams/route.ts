import { NextResponse } from 'next/server';
import { dramaStreams } from '@/lib/ajest/drama';
import { myserverForDrama } from '@/lib/ajest/myserver';
import type { VideoSource } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Episode sources — My Server vault (self-hosted Telegram/archive) +
 *  direct HLS (when pre-resolved upstream) + hoster embeds.
 *  Same VideoSource shape as /api/streams, so the Player consumes both. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const slug = (sp.get('slug') || '').trim();
  const episode = Math.max(1, parseFloat(sp.get('episode') || '1') || 1);
  if (!slug) return NextResponse.json({ ok: false, sources: [], providersTried: [], error: 'missing slug' }, { status: 400 });

  // My Server vault first — instant local lookup; upstream tiers below it act
  // as the failover chain when the vault misses or the worker is down.
  const vault: VideoSource[] = [];
  const mine = myserverForDrama(slug, episode);
  if (mine) vault.push(mine);
  try {
    const r = await dramaStreams(slug, episode);
    const sources = [...vault, ...r.sources];
    return NextResponse.json({ ok: sources.length > 0, sources, providersTried: r.providersTried, episodeTitle: r.episodeTitle });
  } catch (e) {
    return NextResponse.json(
      {
        ok: vault.length > 0,
        sources: vault,
        providersTried: [{ provider: 'dramacool', ok: false, error: e instanceof Error ? e.message.slice(0, 60) : 'streams failed' }],
      },
      { status: 200 }
    );
  }
}
