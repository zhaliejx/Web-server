import { NextResponse } from 'next/server';
import { cached } from '@/lib/ajest/upstream';
import { mangaList } from '@/lib/ajest/mangadex';
import { pillSearch } from '@/lib/ajest/mangapill';
import type { MangaItem } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ ok: true, results: [] });

  // Both tiers race in parallel; MangaDex keeps priority, MangaPill results
  // follow (deduped by normalized title so the same series doesn't double up).
  const [md, pill] = await Promise.allSettled([
    cached(`manga:search:v1:${q.toLowerCase()}`, 3 * 60_000, () =>
      mangaList({ title: q, 'order[relevance]': 'desc' }, 24)
    ),
    pillSearch(q, 18),
  ]);

  const mdResults = md.status === 'fulfilled' ? md.value : [];
  const pillResults = pill.status === 'fulfilled' ? pill.value : [];

  if (!mdResults.length && !pillResults.length) {
    const reason = md.status === 'rejected' ? md.reason : pill.status === 'rejected' ? pill.reason : null;
    return NextResponse.json(
      { ok: false, results: [], error: reason instanceof Error ? reason.message : 'search failed' },
      { status: 200 }
    );
  }

  const seen = new Set<string>();
  const merged: MangaItem[] = [];
  for (const m of [...mdResults, ...pillResults]) {
    const key = normTitle(m.title);
    if (key && seen.has(key)) continue;
    seen.add(key);
    merged.push(m);
    if (merged.length >= 36) break;
  }
  return NextResponse.json({ ok: true, results: merged });
}
