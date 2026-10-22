import { NextResponse } from 'next/server';
import { PILL_CDN_HOSTS, PILL_IMAGE_HEADERS } from '@/lib/ajest/mangapill';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Image relay for the MangaPill tier — its CDN only serves bytes carrying a
 * mangapill.com Referer, which browser <img> tags can never send from our
 * origin. This route fetches server-side and streams the image back.
 * Hard-allowlisted to the pill CDN hostnames (unlike /api/proxy, arbitrary
 * destinations are rejected) and responses are immutable, so the browser
 * caches covers/pages across sessions.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('u') || '';
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'bad url' }, { status: 400 });
  }
  if (target.protocol !== 'https:' || !PILL_CDN_HOSTS.includes(target.hostname)) {
    return NextResponse.json({ ok: false, error: 'host not allowed' }, { status: 403 });
  }
  try {
    const upstream = await fetch(target, { headers: PILL_IMAGE_HEADERS, cache: 'no-store' });
    if (!upstream.ok) throw new Error(`CDN ${upstream.status}`);
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'image relay failed' },
      { status: 502 }
    );
  }
}
