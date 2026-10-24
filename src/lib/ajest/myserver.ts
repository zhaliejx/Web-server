// ── My Server — self-hosted episode vault lookup (server-side) ───────────────
// A hand-curated JSON map of "this anime/drama episode → direct video URL".
// Sources are Telegram files streamed by the tg-worker (or any other direct
// MP4 with Range support, e.g. archive.org). Zero network cost here: the map
// ships with the bundle and lookups are instant, so the streams routes can
// slot it in as tier 0 of the failover chain — when the vault has an episode
// it plays FIRST; when it misses, the chain behaves exactly as before.
//
// URL shape is "https://…/stream/<chatId>/<msgId>" (tg-worker) or any plain
// MP4. The Player plays these natively (<video src>) WITHOUT the /api/proxy
// wrapper — episodes are hundreds of MB and must never transit Vercel.

import raw from './myserver-data.json';
import type { VideoSource } from './types';

interface MyServerEntry {
  kind: 'anime' | 'drama';
  anilistId?: number;
  titles?: string[];
  dramaSlug?: string;
  episode: number;
  url: string;
  note?: string;
  quality?: string;
}

interface MyServerData {
  items?: MyServerEntry[];
}

/** Runtime override for quick edits without a redeploy: MYSERVER_JSON=<json>. */
function loadData(): MyServerData {
  const env = process.env.MYSERVER_JSON;
  if (env) {
    try {
      return JSON.parse(env) as MyServerData;
    } catch {
      /* fall through to the bundled map */
    }
  }
  return raw as MyServerData;
}

/** "One Piece!" / "  one-piece " → "one piece" */
function normTitle(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSource(e: MyServerEntry, noteSuffix: string): VideoSource {
  return {
    provider: 'myserver',
    url: e.url,
    quality: e.quality || 'auto',
    isM3U8: false,
    note: [e.note || 'Self-hosted vault', noteSuffix].filter(Boolean).join(' · '),
  };
}

/** Tier-0 lookup for anime streams. titles: [main, english, romaji, native]. */
export function myserverForAnime(
  ids: { anilistId?: number | null; titles: (string | undefined)[] },
  episode: number
): VideoSource | null {
  const data = loadData();
  const items = data.items || [];
  const wantedTitles = ids.titles.map(normTitle).filter(Boolean);
  for (const e of items) {
    if (e.kind !== 'anime') continue;
    if ((e.episode ?? NaN) !== episode) continue;
    if (ids.anilistId && e.anilistId && e.anilistId === ids.anilistId) return toSource(e, '');
    if (e.titles?.some((t) => wantedTitles.includes(normTitle(t)))) return toSource(e, '');
  }
  return null;
}

/** Tier-0 lookup for drama streams (dramacool slug). Decimals supported. */
export function myserverForDrama(slug: string, episode: number): VideoSource | null {
  const data = loadData();
  const items = data.items || [];
  const want = normTitle(slug);
  for (const e of items) {
    if (e.kind !== 'drama') continue;
    if ((e.episode ?? NaN) !== episode) continue;
    if (normTitle(e.dramaSlug || '') === want) return toSource(e, '');
  }
  return null;
}
