import { NextResponse } from 'next/server';
import { cached } from '@/lib/ajest/upstream';
import { mangaList, mangaTagUuids } from '@/lib/ajest/mangadex';
import type { MangaItem } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const gap = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SectionKey =
  | 'trending'
  | 'manhwa'
  | 'manhua'
  | 'action'
  | 'romance'
  | 'fantasy'
  | 'latest'
  | 'new';

// Rails are fetched sequentially with small gaps to stay under MangaDex's
// 5 req/s guideline; the whole home is cached for 5 minutes afterwards.
async function buildHome(): Promise<Record<string, MangaItem[]>> {
  const tags = await mangaTagUuids(['Action', 'Romance', 'Fantasy']).catch(() => ({}) as Record<string, string>);
  const sections: Record<string, MangaItem[]> = {};
  const jobs: [SectionKey, () => Promise<MangaItem[]>][] = [
    ['trending', () => mangaList({ 'order[followedCount]': 'desc' })],
    ['manhwa', () => mangaList({ 'order[followedCount]': 'desc', 'originalLanguage[]': 'kr' })],
    ['manhua', () => mangaList({ 'order[followedCount]': 'desc', 'originalLanguage[]': 'cn' })],
    ['action', () => mangaList({ 'order[followedCount]': 'desc', 'includedTags[]': tags.Action, includedTagsMode: 'AND' })],
    ['romance', () => mangaList({ 'order[followedCount]': 'desc', 'includedTags[]': tags.Romance, includedTagsMode: 'AND' })],
    ['fantasy', () => mangaList({ 'order[followedCount]': 'desc', 'includedTags[]': tags.Fantasy, includedTagsMode: 'AND' })],
    ['latest', () => mangaList({ 'order[latestUploadedChapter]': 'desc' })],
    ['new', () => mangaList({ 'order[createdAt]': 'desc' })],
  ];
  for (const [key, fn] of jobs) {
    try {
      sections[key] = await fn();
    } catch {
      sections[key] = [];
    }
    await gap(180);
  }
  return sections;
}

export async function GET() {
  try {
    const sections = await cached('manga:home:v1', 5 * 60_000, buildHome);
    return NextResponse.json({ ok: true, tier: 'mangadex', sections });
  } catch (e) {
    return NextResponse.json(
      { ok: false, tier: 'mangadex', sections: {}, error: e instanceof Error ? e.message : 'catalog failed' },
      { status: 200 }
    );
  }
}
