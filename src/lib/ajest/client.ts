'use client';

import type { AnimeCard, DetailPayload, DramaDetail, DramaItem, DramaStreamsPayload, HealthPayload, StreamsPayload } from './types';
import { enabledProviders } from './prefs';

// ── Client fetch helpers (all relative paths through the Next.js gateway) ───

export async function fetchHealth(): Promise<HealthPayload> {
  const r = await fetch('/api/health', { cache: 'no-store' });
  return r.json();
}

export async function fetchCatalog(): Promise<{ ok?: boolean; tier: string; sections: Record<string, AnimeCard[]> }> {
  const r = await fetch('/api/anime/catalog', { cache: 'no-store' });
  return r.json();
}

export async function fetchSearch(q: string): Promise<{ tier: string; results: AnimeCard[] }> {
  const r = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
  return r.json();
}

export async function fetchDetail(
  id: string,
  title: string
): Promise<DetailPayload & { ok: boolean; error?: string }> {
  const r = await fetch(
    `/api/anime/detail?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`,
    { cache: 'no-store' }
  );
  return r.json();
}

export async function fetchSchedule(): Promise<{ ok: boolean; error?: string; items: AnimeCard[] }> {
  const r = await fetch('/api/anime/schedule', { cache: 'no-store' });
  return r.json();
}

export async function fetchStreams(anime: Pick<AnimeCard, 'title' | 'titleEnglish' | 'titleRomaji' | 'titleNative' | 'anilistId' | 'malId'>, episode: number): Promise<StreamsPayload> {
  const p = new URLSearchParams({
    title: anime.title,
    episode: String(episode),
  });
  if (anime.titleEnglish) p.set('titleEnglish', anime.titleEnglish);
  if (anime.titleRomaji) p.set('titleRomaji', anime.titleRomaji);
  if (anime.titleNative) p.set('titleNative', anime.titleNative);
  if (anime.anilistId) p.set('anilistId', String(anime.anilistId));
  if (anime.malId) p.set('malId', String(anime.malId));
  // Source toggles — disabled tiers are skipped server-side entirely
  p.set('providers', enabledProviders().join(','));
  const r = await fetch(`/api/streams?${p.toString()}`, { cache: 'no-store' });
  return r.json();
}

// ── Dramas (K-drama / C-drama tier) ─────────────────────────────────────────

export async function fetchDramaCatalog(): Promise<{ ok?: boolean; sections: { title: string; items: DramaItem[] }[] }> {
  const r = await fetch('/api/drama/catalog', { cache: 'no-store' });
  return r.json();
}

export async function fetchDramaSearch(q: string): Promise<{ ok: boolean; results: DramaItem[] }> {
  const r = await fetch(`/api/drama/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
  return r.json();
}

export async function fetchDramaDetail(slug: string): Promise<DramaDetail & { ok: boolean; error?: string }> {
  const r = await fetch(`/api/drama/detail?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
  return r.json();
}

export async function fetchDramaStreams(slug: string, episode: number): Promise<DramaStreamsPayload> {
  const r = await fetch(`/api/drama/streams?slug=${encodeURIComponent(slug)}&episode=${episode}`, { cache: 'no-store' });
  return r.json();
}

// ── Formatting helpers ───────────────────────────────────────────────────────

export function fmtDuration(min?: number): string {
  if (!min || min <= 0) return '— min';
  return `${min} min`;
}

/** Live countdown "2d 03h 14m 09s" until unix-seconds timestamp */
export function fmtCountdown(airingAt: number, now: number): { text: string; live: boolean } {
  const diff = airingAt * 1000 - now;
  if (diff <= 0) return { text: 'Airing now', live: true };
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return { text: `${d}d ${pad(h)}h ${pad(m)}m ${pad(sec)}s`, live: false };
  if (h > 0) return { text: `${h}h ${pad(m)}m ${pad(sec)}s`, live: false };
  return { text: `${m}m ${pad(sec)}s`, live: false };
}

export function fmtTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtProgress(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m watched`;
  return `${m}m watched`;
}

export function cleanDescription(d?: string): string {
  if (!d) return 'No synopsis available yet.';
  return d
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fmtScore(score?: number): string {
  if (score === undefined || score === null) return 'N/A';
  return (score / 10).toFixed(1);
}
