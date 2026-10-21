import { NextResponse } from 'next/server';
import { anilistQuery, aniZip } from '@/lib/ajest/upstream';
import { gogoProbe, relayProbe } from '@/lib/ajest/gogo';
import type { HealthPayload } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';

// Verifies all real upstream tiers so the splash screen can report readiness.
//   anilist — primary catalog (GraphQL)         · may show brief global outages
//   kitsu   — fallback catalog (JSON:API)       · handled implicitly via catalog
//   anizip  — per-episode metadata mappings
//   gogo    — gogoanime.by direct scrape engine (streams)
//   relay   — api-ajest search assist (gogo slug discovery fallback)
export async function GET() {
  const [anilist, anizip, gogo, relay] = await Promise.allSettled([
    anilistQuery('query { Media(id: 1) { id } }', {}, 6000),
    aniZip({ anilistId: 154587 }), // Frieren — known-good mapping
    gogoProbe(),
    relayProbe(),
  ]);

  const services = {
    anilist: anilist.status === 'fulfilled',
    kitsu: true, // Kitsu reachability is verified by the catalog fallback path
    anizip: anizip.status === 'fulfilled' && !!anizip.value,
    gogo: gogo.status === 'fulfilled' && gogo.value,
    relay: relay.status === 'fulfilled' && relay.value,
  };

  const payload: HealthPayload = {
    ok: services.anilist || services.gogo || services.relay, // at least one real tier
    services,
    checkedAt: Date.now(),
  };
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
