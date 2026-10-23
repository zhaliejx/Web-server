'use client';

// ── New-episode radar (client) ───────────────────────────────────────────────
// Compares each title's Aired-now count (one batched AniList-backed request,
// server-cached 10 min) against the episode stored in local History:
//   newEps = airedNow − lastWatchedEpisode   (0 when caught up or unknown)
// Only AniList-addressed titles can be radar-tracked (kitsu/gogo rows opt out).

import { useEffect, useState } from 'react';
import { fetchUpdates } from './client';
import type { HistoryEntry } from './types';

const ANILIST_ID_RE = /^anilist:\d+$/;

/** How many unseen episodes exist past the locally-saved one (capped at 99 —
 *  a 1000-episode backlog on a long-runner is noise, not a useful badge). */
export function newEpsSince(watchedEpisode: number | undefined, aired: number | null | undefined): number {
  if (!aired || !watchedEpisode || watchedEpisode < 0) return 0;
  return Math.min(99, Math.max(0, aired - watchedEpisode));
}

/** Batched aired-counts for the given library ids (anilist: ids only, ≤24). */
export function useAiredCounts(ids: string[]): Record<string, number | null> {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const key = [...new Set(ids.filter((i) => ANILIST_ID_RE.test(i)))].sort().slice(0, 24).join(',');

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetchUpdates(key.split(','))
      .then((d) => {
        if (!cancelled && d.ok) setCounts(d.counts);
      })
      .catch(() => undefined); // radar is best-effort — silence is fine
    return () => {
      cancelled = true;
    };
  }, [key]);

  return counts;
}

/** Convenience for history-keyed collections: id → new-episode count. */
export function useNewEpisodeMap(
  entries: Record<string, HistoryEntry> | HistoryEntry[]
): Record<string, number> {
  const list = Array.isArray(entries) ? entries : Object.values(entries);
  const counts = useAiredCounts(list.map((e) => e.anime.id));
  const out: Record<string, number> = {};
  for (const e of list) {
    const n = newEpsSince(e.episode?.number, counts[e.anime.id]);
    if (n > 0) out[e.anime.id] = n;
  }
  return out;
}
