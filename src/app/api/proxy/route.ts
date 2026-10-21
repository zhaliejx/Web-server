import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// ── HLS stream proxy ────────────────────────────────────────────────────────
// Streams from Consumet providers block cross-origin reads and often require a
// Referer header. This proxy:
//   1. Pipes m3u8 playlists and rewrites every playlist/segment URI back
//      through this proxy so hls.js only ever talks to our origin.
//   2. Pipes binary segments (ts/m4s/mp4) through with full Range support —
//      required for seeking on the googlevideo direct-MP4 sources.

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const REFERERS = ['https://gogoanime.by/', 'https://gogoanime.by/', 'https://www.google.com/'];

function proxied(abs: string): string {
  // Root-relative: hls.js resolves these against the manifest's own origin,
  // which keeps playback correct behind any gateway/host.
  return `/api/proxy?u=${encodeURIComponent(abs)}`;
}

function absolutize(u: string, base: string): string | null {
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}

function rewriteM3U8(body: string, base: string): string {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) {
      out.push(line);
      continue;
    }
    if (line.startsWith('#')) {
      // Rewrite URI="..." attributes inside tags (keys, maps, alternate audio…)
      out.push(line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
        const abs = absolutize(uri, base);
        return `URI="${abs ? proxied(abs) : uri}"`;
      }));
      continue;
    }
    // Plain playlist/segment line
    const abs = absolutize(line.trim(), base);
    out.push(abs ? proxied(abs) : line);
  }
  return out.join('\n');
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || '';
  if (!/^https?:\/\//i.test(u)) {
    return new Response('invalid url', { status: 400 });
  }

  const headers: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    Accept: '*/*',
  };
  try {
    const origin = new URL(u).origin;
    headers['Referer'] = `${origin}/`;
    headers['Origin'] = origin;
  } catch {
    /* keep defaults */
  }
  // Some CDNs validate against specific referers — add fallbacks on retry below.
  const range = req.headers.get('range');
  if (range) headers['Range'] = range;

  let upstream: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const h = { ...headers };
      if (attempt > 0) {
        h['Referer'] = REFERERS[attempt % REFERERS.length];
        delete h['Origin'];
      }
      upstream = await fetch(u, { headers: h, cache: 'no-store', redirect: 'follow' });
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!upstream || !upstream.ok) {
    return new Response(`upstream error: ${lastErr instanceof Error ? lastErr.message : upstream?.status ?? 'unknown'}`, {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  const contentType = upstream.headers.get('content-type') || '';
  const isPlaylist = u.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u');

  if (isPlaylist) {
    const text = await upstream.text();
    const rewritten = rewriteM3U8(text, u);
    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Binary segment passthrough
  const respHeaders = new Headers();
  ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
    const v = upstream!.headers.get(h);
    if (v) respHeaders.set(h, v);
  });
  if (!respHeaders.has('content-type')) respHeaders.set('content-type', 'video/mp2t');
  respHeaders.set('Access-Control-Allow-Origin', '*');
  respHeaders.set('Cache-Control', 'public, max-age=3600');

  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}
