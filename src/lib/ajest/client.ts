'use client';

import type { AnimeCard, DetailPayload, DramaDetail, DramaItem, DramaStreamsPayload, HealthPayload, StreamsPayload } from './types';
import { enabledProviders, enabledDramaSources, loadAudioPref } from './prefs';

// ── Client fetch helpers (all relative paths through the Next.js gateway) ───
// Every call is timeout-guarded: on an old iPad a hanging socket used to mean
// a spinner that never resolved ("stuck in loading"). 20 s covers slow datacenter
// relays; the caller's catch/render path handles the AbortError like any error.

async function fetchT(url: string, timeoutMs = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: 'no-store', signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchHealth(): Promise<HealthPayload> {
  const r = await fetchT('/api/health');
  return r.json();
}

export async function fetchCatalog(): Promise<{ ok?: boolean; tier: string; sections: Record<string, AnimeCard[]> }> {
  const r = await fetchT('/api/anime/catalog');
  return r.json();
}

export async function fetchSearch(q: string): Promise<{ tier: string; results: AnimeCard[] }> {
  const r = await fetchT(`/api/anime/search?q=${encodeURIComponent(q)}`);
  return r.json();
}

export async function fetchDetail(
  id: string,
  title: string
): Promise<DetailPayload & { ok: boolean; error?: string }> {
  const r = await fetchT(
    `/api/anime/detail?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`
  );
  return r.json();
}

export async function fetchSchedule(): Promise<{ ok: boolean; error?: string; items: AnimeCard[] }> {
  const r = await fetchT('/api/anime/schedule');
  return r.json();
}

// ── Browse (full-catalog filters + sort + paging) ────────────────────────────

export interface BrowsePageInfo {
  total: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
}

export interface BrowsePayload {
  ok: boolean;
  error?: string;
  items: AnimeCard[];
  pageInfo: BrowsePageInfo;
}

export async function fetchBrowse(p: {
  genres?: string[];
  tags?: string[];
  sort?: string;
  page?: number;
}): Promise<BrowsePayload> {
  const q = new URLSearchParams();
  if (p.genres?.length) q.set('genres', p.genres.join(','));
  if (p.tags?.length) q.set('tags', p.tags.join(','));
  q.set('sort', p.sort || 'trending');
  q.set('page', String(Math.max(1, p.page || 1)));
  const r = await fetchT(`/api/anime/browse?${q.toString()}`);
  return r.json();
}

// ── New-episode radar (aired counts vs. local history) ──────────────────────

export async function fetchUpdates(
  ids: string[]
): Promise<{ ok: boolean; counts: Record<string, number | null> }> {
  if (!ids.length) return { ok: true, counts: {} };
  const r = await fetchT(`/api/anime/updates?ids=${encodeURIComponent(ids.slice(0, 24).join(','))}`);
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
  // Audio track preference — drives the ani.pm /sub or /dub embed variant
  p.set('audio', loadAudioPref());
  const r = await fetchT(`/api/streams?${p.toString()}`);
  return r.json();
}

// ── Dramas (K-drama / C-drama tier) ─────────────────────────────────────────

export async function fetchDramaCatalog(): Promise<{ ok?: boolean; sections: { title: string; items: DramaItem[] }[] }> {
  const r = await fetchT('/api/drama/catalog');
  return r.json();
}

export async function fetchDramaSearch(q: string): Promise<{ ok: boolean; results: DramaItem[] }> {
  const r = await fetchT(`/api/drama/search?q=${encodeURIComponent(q)}`);
  return r.json();
}

export async function fetchDramaDetail(slug: string): Promise<DramaDetail & { ok: boolean; error?: string }> {
  const r = await fetchT(`/api/drama/detail?slug=${encodeURIComponent(slug)}`);
  return r.json();
}

export async function fetchDramaStreams(slug: string, episode: number): Promise<DramaStreamsPayload> {
  const p = new URLSearchParams({
    slug,
    episode: String(episode),
  });
  // Drama source toggles — disabled tiers are skipped server-side entirely
  p.set('providers', enabledDramaSources().join(','));
  const r = await fetchT(`/api/drama/streams?${p.toString()}`);
  return r.json();
}

// ── Drama Explore (country/genre/status/type/year filters + sort + paging) ──

export interface DramaExplorePageInfo {
  total: number;
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
}

export interface DramaExplorePayload {
  ok: boolean;
  error?: string;
  items: DramaItem[];
  pageInfo: DramaExplorePageInfo;
}

export async function fetchDramaExplore(p: {
  country?: string;
  genre?: string;
  status?: string;
  type?: string;
  year?: string;
  sort?: string;
  page?: number;
}): Promise<DramaExplorePayload> {
  const q = new URLSearchParams();
  if (p.country) q.set('country', p.country);
  if (p.genre) q.set('genre', p.genre);
  if (p.status) q.set('status', p.status);
  if (p.type) q.set('type', p.type);
  if (p.year) q.set('year', p.year);
  q.set('sort', p.sort || 'most_popular');
  q.set('page', String(Math.max(1, p.page || 1)));
  const r = await fetchT(`/api/drama/explore?${q.toString()}`);
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
