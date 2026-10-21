import { NextResponse } from 'next/server';
import {
  anilistCard,
  anilistQuery,
  ANILIST_CARD_FIELDS,
  aniZip,
  cached,
  kitsuSeasonal,
  currentSeason,
  GOGO_BASE,
} from '@/lib/ajest/upstream';
import type { AnimeCard } from '@/lib/ajest/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCHEDULE_QUERY = `
  query Schedule($start: Int, $end: Int) {
    Page(page: 1, perPage: 120) {
      airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
        id
        airingAt
        episode
        media { ${ANILIST_CARD_FIELDS} }
      }
    }
  }
`;

interface RawSchedule {
  id: number;
  airingAt: number;
  episode: number;
  media: Record<string, unknown> | null;
}

// ── Fallback when AniList is down ───────────────────────────────────────────
// Kitsu current-season airing titles + gogoanime.by ongoing series.
// Air times: bridged through ani.zip (kitsu_id → next episode airDateUtc) so
// countdowns stay minute-accurate even while AniList is offline.
async function fallbackSchedule(): Promise<AnimeCard[]> {
  const out: AnimeCard[] = [];
  const { season, year } = currentSeason();
  try {
    const kitsu = await kitsuSeasonal(season, year, 20);
    const airing = kitsu.filter((a) => a.status === 'RELEASING');

    // Bridge exact air times in parallel (ani.zip supports kitsu_id directly)
    const bridged = await Promise.allSettled(
      airing.slice(0, 16).map(async (a) => {
        const kitsuId = a.id.startsWith('kitsu:') ? parseInt(a.id.split(':')[1], 10) : undefined;
        if (!kitsuId) return a;
        const zip = await aniZip({ kitsuId });
        if (!zip?.episodes.length) return a;
        const nowSec = Math.floor(Date.now() / 1000);
        const next = zip.episodes
          .map((e) => ({ n: e.number, at: e.airDateUtc ? Math.floor(new Date(e.airDateUtc).getTime() / 1000) : 0 }))
          .filter((e) => e.at > nowSec)
          .sort((x, y) => x.at - y.at)[0];
        return next ? { ...a, airingAt: next.at, episodeNo: next.n } : a;
      })
    );
    for (const r of bridged) {
      if (r.status === 'fulfilled') out.push(r.value);
    }
  } catch {
    /* kitsu down */
  }
  if (!out.length) {
    try {
      const html = await fetchHtml(`${GOGO_BASE}/`, 9000);
      const re = /href="https:\/\/gogoanime\.by\/category\/([a-z0-9-]+)\/"/g;
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && seen.size < 15) {
        const slug = m[1];
        if (seen.has(slug)) continue;
        seen.add(slug);
        out.push({ id: `gogo:${slug}`, title: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), cover: '', source: 'gogo' });
      }
    } catch {
      /* gogo down */
    }
  }
  return out;
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36' },
    });
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ── Simulcast weekly schedule: AniList airing schedules (exact-to-the-minute)
export async function GET() {
  try {
    const items = await cached('schedule:v4', 4 * 60_000, async (): Promise<AnimeCard[]> => {
      const now = Math.floor(Date.now() / 1000);
      const end = now + 7 * 24 * 3600;
      try {
        const d = await anilistQuery<{ Page: { airingSchedules: RawSchedule[] } }>(
          SCHEDULE_QUERY,
          { start: now, end },
          11000
        );
        const items = d.Page.airingSchedules
          .filter((s) => s.media)
          .map((s) => ({
            ...anilistCard(s.media as never),
            airingAt: s.airingAt,
            episodeNo: s.episode,
          }));
        if (items.length) return items;
        throw new Error('schedule empty');
      } catch {
        return await fallbackSchedule();
      }
    });
    return NextResponse.json({ ok: true, items, now: Date.now() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, items: [], error: e instanceof Error ? e.message : 'schedule failed' },
      { status: 200 }
    );
  }
}
