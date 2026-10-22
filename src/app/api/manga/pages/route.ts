import { NextResponse } from 'next/server';
import { HEADERS } from '@/lib/ajest/mangadex';
import { isPillChapterId, pillPages } from '@/lib/ajest/mangapill';
import { isMrChapterId, mrPages } from '@/lib/ajest/mangaread';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Page resolver for all manga tiers:
 * • MangaPill (mpc:) / MangaRead (mrc:) — scrape the chapter page; their CDN
 *   paths are permanent, so both cache generously and return direct urls
 *   (MangaPill images relay through /api/manga/image; MangaRead hotlinks fine).
 * • MangaDex — at-home server returns fresh, short-lived page image URLs for a
 *   chapter. Never cached: links rotate and are effectively single-session.
 */
export async function GET(req: Request) {
  const chapter = (new URL(req.url).searchParams.get('chapter') || '').trim();
  if (!chapter) return NextResponse.json({ ok: false, error: 'missing chapter' }, { status: 400 });
  try {
    if (isPillChapterId(chapter)) {
      const pages = await pillPages(chapter);
      if (!pages.length) throw new Error('No readable pages returned');
      return NextResponse.json({ ok: true, pages, source: 'mangapill' });
    }
    if (isMrChapterId(chapter)) {
      const pages = await mrPages(chapter);
      if (!pages.length) throw new Error('No readable pages returned');
      return NextResponse.json({ ok: true, pages, source: 'mangaread' });
    }

    const r = await fetch(`https://api.mangadex.org/at-home/server/${encodeURIComponent(chapter)}`, {
      headers: HEADERS,
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(`MangaDex ${r.status}`);
    const j = (await r.json()) as {
      baseUrl?: string | null;
      chapter?: { hash?: string; data?: string[]; dataSaver?: string[] };
    };
    const base = j.baseUrl;
    const hash = j.chapter?.hash;
    const files = j.chapter?.data || [];
    if (!base || !hash || !files.length) throw new Error('No readable pages returned');
    const pages = files.map((f) => `${base}/data/${hash}/${f}`);
    return NextResponse.json({ ok: true, pages });
  } catch (e) {
    return NextResponse.json(
      { ok: false, pages: [], error: e instanceof Error ? e.message : 'pages failed' },
      { status: 200 }
    );
  }
}
