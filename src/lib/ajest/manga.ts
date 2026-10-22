'use client';

import type { MangaChapter, MangaItem } from './types';

// ── Manga client fetchers (relative paths through the Next.js gateway) ──────

export async function fetchMangaCatalog(): Promise<{
  ok?: boolean;
  tier: string;
  sections: Record<string, MangaItem[]>;
}> {
  const r = await fetch('/api/manga/catalog', { cache: 'no-store' });
  return r.json();
}

export async function fetchMangaSearch(q: string): Promise<{ ok?: boolean; results: MangaItem[] }> {
  const r = await fetch(`/api/manga/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
  return r.json();
}

export async function fetchMangaDetail(id: string): Promise<{ ok?: boolean; manga: MangaItem; error?: string }> {
  const r = await fetch(`/api/manga/detail?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
  return r.json();
}

export async function fetchMangaChapters(id: string): Promise<{ ok?: boolean; chapters: MangaChapter[] }> {
  const r = await fetch(`/api/manga/chapters?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
  return r.json();
}

export async function fetchMangaPages(chapterId: string): Promise<{ ok?: boolean; pages: string[] }> {
  const r = await fetch(`/api/manga/pages?chapter=${encodeURIComponent(chapterId)}`, { cache: 'no-store' });
  return r.json();
}

// ── Formatting helpers ───────────────────────────────────────────────────────

export function mangaOriginLabel(origin: MangaItem['origin']): string | null {
  if (origin === 'kr') return 'Manhwa';
  if (origin === 'cn') return 'Manhua';
  return null; // jp reads as the default "manga" — no badge needed
}

export function mangaStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ongoing: 'Ongoing',
    completed: 'Completed',
    hiatus: 'On Hiatus',
    cancelled: 'Cancelled',
  };
  return map[status] || 'Unknown status';
}

export function fmtFollows(n?: number): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M follows`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K follows`;
  return `${n} follows`;
}

export function fmtChapterDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const diff = Date.now() - ms;
  if (diff < 86400_000) return 'Today';
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
