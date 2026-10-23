import { NextResponse } from 'next/server';
import { PILL_CDN_HOSTS, PILL_IMAGE_HEADERS } from '@/lib/ajest/mangapill';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ── Download passthrough for OFFLINE manga (IndexedDB chapter saves) ────────
// The reader fetches page bytes through this same-origin route so blobs can be
// stored in IndexedDB without CORS walls: MangaDex at-home uploads rotate and
// are fetchable cross-origin only sometimes, MangaPill's CDN demands a
// mangapill.com Referer browsers can't send, and a stable server-side UA keeps
// MangaRead's CDN happy. Hard-allowlisted by hostname suffix (like
// /api/manga/image) — arbitrary destinations are rejected.

const ALLOWED_SUFFIXES = [
  'mangadex.org', // uploads.mangadex.org at-home pages
  'mangadex.network', // MangaDex image network mirrors
  'readdetectiveconan.com', // MangaPill CDN (PILL_CDN_HOSTS)
  'mangaread.org', // MangaRead wp-content images
];

function hostAllowed(hostname: string): boolean {
  return (
    PILL_CDN_HOSTS.includes(hostname) ||
    ALLOWED_SUFFIXES.some((s) => hostname === s || hostname.endsWith(`.${s}`))
  );
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('u') || '';
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'bad url' }, { status: 400 });
  }
  if (target.protocol !== 'https:' || !hostAllowed(target.hostname)) {
    return NextResponse.json({ ok: false, error: 'host not allowed' }, { status: 403 });
  }
  try {
    const upstream = await fetch(target, { headers: PILL_IMAGE_HEADERS, cache: 'no-store' });
    if (!upstream.ok) throw new Error(`CDN ${upstream.status}`);
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
        // No long browser cache — these bytes go straight into IndexedDB
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'download relay failed' },
      { status: 502 }
    );
  }
}
