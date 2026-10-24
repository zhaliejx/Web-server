// ── Netflix exclusives → playable drama resolver (server-only) ──────────────
// The bundled catalog (netflix-catalog.ts) holds titles, not dramacool slugs.
// Resolution is a two-step, both-verified pipeline:
//   1. Slug guess — dramacool slugs ARE normalized titles ("squid-game",
//      "single-s-inferno"), and taken base slugs get disambiguated with the
//      release year ("hidden-love" is a Thai show, the C-drama lives at
//      "hidden-love-2023"). We try `<base>` then `<base>-<year>`, fetch the
//      detail page directly, and VERIFY the name (+ year) before accepting.
//   2. Search — dramacool's own search engine is weak (it regularly omits
//      titles it hosts), so it's the fallback, ranked by token overlap.
// Results cache 7 days server-side (including null misses) — a warm lambda
// answers instantly and upstream is touched once per title.

import type { DramaItem } from './types';
import { dramaDetail, dramaSearch } from './drama';
import { cached } from './upstream';

/** Fold accents + punctuation into the canonical matching form. */
export function normTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // é → e
    .toLowerCase()
    .replace(/[\u2019\u2018\u201c\u201d']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normTitle(s).split(' ').filter(Boolean);
}

/** dramacool-style slug: apostrophes become "s-separators" ("Single's" →
 *  "single-s"), diacritics fold, everything else collapses to hyphens. */
function slugGuesses(title: string, year?: number): string[] {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2019\u2018\u201c\u201d']/g, '-')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const guesses = [base];
  if (year) guesses.push(`${base}-${year}`);
  return guesses;
}

/** Rank a search result against the catalog title. 0..1+ */
export function rankDramaMatch(candidate: DramaItem, title: string, year?: number): number {
  const q = new Set(tokens(title));
  const n = new Set(tokens(candidate.title));
  if (!q.size || !n.size) return 0;
  let inter = 0;
  for (const w of q) if (n.has(w)) inter++;
  const qCover = inter / q.size; // how much of the query the name explains
  let interN = 0;
  for (const w of n) if (q.has(w)) interN++;
  const nCover = interN / n.size; // how much of the name the query explains
  let score = 0.7 * qCover + 0.3 * nCover;
  if (normTitle(candidate.title) === normTitle(title)) score += 0.35; // exact
  // Year sanity — dramacool release year vs Netflix year (±1 tolerance for
  // late-year titles landing on Netflix the following year).
  const candYear = candidate.year ? parseInt(candidate.year, 10) : NaN;
  if (year && Number.isFinite(candYear)) {
    if (Math.abs(candYear - year) <= 1) score += 0.06;
    else if (Math.abs(candYear - year) > 3) score -= 0.08;
  }
  // Penalize clearly padded names ("… Season 2" when no season was asked).
  const qSeason = /season \d|part \d|class \d|s\d\b/i.test(title);
  const nSeason = /season \d|part \d|class \d|s\d\b/i.test(candidate.title);
  if (nSeason && !qSeason) score -= 0.22;
  return score;
}

export function bestDramaMatch(results: DramaItem[], title: string, year?: number): DramaItem | null {
  let best: DramaItem | null = null;
  let bestScore = 0;
  for (const c of results) {
    const s = rankDramaMatch(c, title, year);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  // 0.55 keeps near-misses out (e.g. "Gone Wednesday" for "Wednesday").
  return bestScore >= 0.55 ? best : null;
}

/** Verify a directly-fetched candidate. Stricter than the search ranker:
 *  when the page carries a release year it must be within ±1 of the catalog
 *  year — this is what rejects the WRONG show sitting on the base slug
 *  ("Hidden Love" 2021 Thailand vs the 2023 C-drama). */
function verifyCandidate(candidate: DramaItem, title: string, year?: number): boolean {
  const q = new Set(tokens(title));
  const n = new Set(tokens(candidate.title));
  if (!q.size || !n.size) return false;
  let inter = 0;
  for (const w of q) if (n.has(w)) inter++;
  const qCover = inter / q.size;
  if (qCover < 0.999) return false; // every query token must appear
  const candYear = candidate.year ? parseInt(candidate.year, 10) : NaN;
  if (year && Number.isFinite(candYear) && Math.abs(candYear - year) > 1) return false;
  return true;
}

/** Resolve a catalog title to a playable dramacool item. Cached 7 days
 *  (including null misses — a dead end costs one lookup, not one per visit). */
export async function resolveNetflixTitle(title: string, year?: number): Promise<DramaItem | null> {
  const key = `drama:netflix-resolve:v1:${normTitle(title)}`;
  return cached(key, 7 * 24 * 3600_000, async () => {
    // 1) Slug guesses — precise, verified, catches what search misses.
    for (const slug of slugGuesses(title, year)) {
      try {
        const det = await dramaDetail(slug);
        if (det?.drama && verifyCandidate(det.drama, title, year)) return det.drama;
      } catch {
        /* slug not found — next guess */
      }
    }
    // 2) Search fallback with the overlap ranker.
    const results = await dramaSearch(title).catch(() => [] as DramaItem[]);
    return bestDramaMatch(results, title, year);
  });
}
