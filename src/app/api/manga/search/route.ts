import { NextResponse } from 'next/server';
import { cached } from '@/lib/ajest/upstream';
import { mangaList } from '@/lib/ajest/mangadex';
import { pillSearch } from '@/lib/ajest/mangapill';
import { mrSearch } from '@/lib/ajest/mangaread';
import type { MangaItem } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ ok: true, results: [] });

  // Which tiers may run — forwarded by the client from its source settings
  const srcParam = (url.searchParams.get('src') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const want = (s: string) => srcParam.length === 0 || srcParam.includes(s);

  // All tiers race in parallel. Priority on collision follows the chain:
  // MangaPill → MangaRead → MangaDex (MangaFire is embed-only, no search
  // tier), deduped by normalized title so series don't double up.
  const jobs: [string, Promise<MangaItem[]>][] = [];
  if (want('mangapill')) jobs.push(['mangapill', pillSearch(q, 16)]);
  if (want('mangaread')) jobs.push(['mangaread', mrSearch(q, 16)]);
  if (want('mangadex')) {
    jobs.push([
      'mangadex',
      cached(`manga:search:v1:${q.toLowerCase()}`, 3 * 60_000, () =>
        mangaList({ title: q, 'order[relevance]': 'desc' }, 24)
      ),
    ]);
  }

  const settled = await Promise.allSettled(jobs.map(([, p]) => p));

  const byTier: Record<string, MangaItem[]> = {};
  settled.forEach((r, i) => {
    const [tier] = jobs[i];
    byTier[tier] = r.status === 'fulfilled' ? r.value : [];
  });

  if (Object.values(byTier).every((list) => !list.length)) {
    const failed = settled.find((r) => r.status === 'rejected');
    const reason =
      failed && failed.status === 'rejected' ? failed.reason : null;
    return NextResponse.json(
      { ok: false, results: [], error: reason instanceof Error ? reason.message : 'search failed' },
      { status: 200 }
    );
  }

  const order = ['mangapill', 'mangaread', 'mangadex'];
  const seen = new Set<string>();
  const merged: MangaItem[] = [];
  for (const tier of order) {
    for (const m of byTier[tier] || []) {
      const key = normTitle(m.title);
      if (key && seen.has(key)) continue;
      seen.add(key);
      merged.push(m);
      if (merged.length >= 40) break;
    }
    if (merged.length >= 40) break;
  }
  return NextResponse.json({ ok: true, results: merged });
}
