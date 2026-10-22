// ── Cross-tier chapter resolver — fills the gaps licensed titles leave ──────
// MangaDex legitimately lists some series with ZERO readable English chapters
// (official chapters live off-site, e.g. Solo Leveling → webnovel links, or
// licensed titles removed from MD entirely). When the MD feed comes back
// empty, this resolver finds the same series on the scrape tiers by trying
// every title candidate (display title + alt titles) and returns whichever
// tier actually carries readable chapters. Chain order (prefs.ts):
//   MangaFire (embed-only, no server chapters) → MangaPill → MangaRead →
//   MangaDex — so mirrors are probed pill-first, and MangaDex (the tier being
//   filled) is naturally last.
// Chapter ids stay namespaced (mpc:/mrc:) so /api/manga/pages dispatches
// transparently — the reader never learns a fallback happened.

import { cached } from './upstream';
import { mangaFeed, mangaTitleCandidates } from './mangadex';
import { pillChapters, pillSearch } from './mangapill';
import { mrChapters, mrSearch } from './mangaread';
import type { MangaChapter } from './types';

/** Novel/web-novel editions share slugs with their manga (“solo-leveling-
 *  novel”) and a contains-match scores 75 — enough to beat every real
 *  candidate when the true series is absent. A mirror match is only trusted
 *  when BOTH sides agree on novel-ness. */
const NOVEL_RE = /(^|[^a-z])novels?([^a-z]|$)/i;
const novelish = (s: string) => NOVEL_RE.test(s);
const novelMismatch = (a: string, b: string) => novelish(a) !== novelish(b);

/** Character-bigram Dice similarity (0-100) — the standard title-fuzzy score.
 *  `similar()` in gogo.ts tokenizes on hyphens only, so a slug like
 *  "sono-bisque-doll-wa-koi-wo-suru" scores 0 against the spaced query
 *  "Sono Bisque Doll wa Koi o Suru" (romaji particle drift kills exact
 *  equality too). Bigrams survive both. Contains/equality still shortcut so
 *  exact matches always outrank fuzzy ones — but a short slug buried inside a
 *  long spin-off title ("…Gouken no Frieren (Doujinshi)" ⊃ "sousou-no-frieren")
 *  is capped hard instead of scoring 75. Edition noise words are stripped so
 *  "(Official)"/"(Colored)" suffixes still match exactly. */
const NOISE_RE = /official|colored|color|comic|webtoon/g;
function dice(a: string, b: string): number {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, '').replace(NOISE_RE, '');
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '').replace(NOISE_RE, '');
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) {
    // containment alone is weak evidence — a 5-char slug inside a 50-char
    // doujinshi title is a spin-off, not the same series
    const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    return ratio < 0.6 ? 50 : 75;
  }
  const grams = (s: string) => {
    const g = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const ga = grams(na);
  const gb = grams(nb);
  let inter = 0;
  ga.forEach((g) => gb.has(g) && inter++);
  return Math.round((2 * inter / (ga.size + gb.size)) * 100);
}

/** Best MangaRead series for a set of title candidates. WP search is fuzzy,
 *  so results are ranked against the candidate (slug + title) and must clear
 *  a similarity bar before their chapter list is trusted. */
async function mrSeriesFor(candidates: string[]): Promise<{ id: string; score: number } | null> {
  for (const q of candidates) {
    try {
      const results = await mrSearch(q, 8);
      const ranked = results
        .filter((r) => {
          const slug = r.id.split(':')[1] || '';
          return !novelMismatch(`${slug} ${r.title}`, q);
        })
        .map((r) => {
          const slug = r.id.split(':')[1] || '';
          return { r, score: Math.max(dice(slug, q), dice(r.title, q)) };
        })
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (!best || best.score < 50) continue;
      return { id: best.r.id, score: best.score };
    } catch {
      /* next candidate */
    }
  }
  return null;
}

/** Same for MangaPill (slug-keyed ids). Pill carries novel editions under
 *  near-identical slugs, so the novel guard matters even more here. */
async function pillSeriesFor(candidates: string[]): Promise<{ id: string; score: number } | null> {
  for (const q of candidates) {
    try {
      const results = await pillSearch(q, 8);
      if (!results.length) continue;
      const ranked = results
        .filter((r) => !novelMismatch(`${r.id.split(':')[2] || ''} ${r.title}`, q))
        .map((r) => ({
          r,
          score: Math.max(dice(r.id.split(':')[2] || '', q), dice(r.title, q)),
        }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      // Pill search matches whole-word titles loosely; require a strong
      // similarity so lookalike series ("Solo Glitch Player") don't pass
      if (!best || best.score < 70) continue;
      return { id: best.r.id, score: best.score };
    } catch {
      /* next candidate */
    }
  }
  return null;
}

/** Fill missing chapter numbers from `fallback` without displacing `primary`
 *  entries — MD chapters keep priority, mirrors fill the gaps. */
function mergeChapters(primary: MangaChapter[], fallback: MangaChapter[]): MangaChapter[] {
  if (!fallback.length) return primary;
  const byNum = new Map<string, MangaChapter>();
  for (const c of fallback) byNum.set(c.number, c);
  for (const c of primary) byNum.set(c.number, c);
  return [...byNum.values()].sort((a, b) => (parseFloat(b.number) || 0) - (parseFloat(a.number) || 0));
}

/** Chapters for any manga id, falling back across tiers when MangaDex is
 *  empty OR suspiciously thin (licensed series often keep only a handful of
 *  readable EN chapters out of 100+). */
export async function mangaChaptersResolved(id: string): Promise<MangaChapter[]> {
  // Scrape-tier ids resolve directly
  if (id.startsWith('mp:')) {
    return cached(`pill:feed:v1:${id}`, 5 * 60_000, () => pillChapters(id));
  }
  if (id.startsWith('mr:')) {
    return cached(`mr:feed:v1:${id}`, 5 * 60_000, () => mrChapters(id));
  }

  // MangaDex UUID — feed first
  const md = await cached(`manga:feed:v1:${id}`, 2 * 60_000, () => mangaFeed(id));

  // Completeness threshold: below 8 chapters we probe the mirrors and merge
  // whichever extra chapters they carry (pure-MD kept when probes find less).
  if (md.length >= 8) return md;

  return cached(`manga:feed:fallback:v1:${id}`, 15 * 60_000, async () => {
    const { candidates, lastChapter } = await mangaTitleCandidates(id);

    let collected: MangaChapter[] = [];
    let matchScore = 0;

    if (candidates.length) {
      // Chain order: MangaPill first, MangaRead second (MangaFire is the
      // embed tier — its chapters are read inside the iframe, not listed here)
      try {
        const hit = await pillSeriesFor(candidates);
        if (hit) {
          const chapters = await pillChapters(hit.id);
          if (chapters.length) {
            collected = chapters;
            matchScore = hit.score;
          }
        }
      } catch {
        /* fall through to MangaRead */
      }

      if (!collected.length) {
        try {
          const hit = await mrSeriesFor(candidates);
          if (hit) {
            const chapters = await mrChapters(hit.id);
            if (chapters.length) {
              collected = chapters;
              matchScore = hit.score;
            }
          }
        } catch {
          /* give up with whatever we have */
        }
      }
    }

    if (!collected.length) return md;

    // Empty MD feed → the mirror can BE the series' readable library, but
    // only on a near-exact match (equality / noise-suffixed titles score
    // 94-100). Anything weaker risks handing a chapterless spin-off or
    // doujinshi entry the main series' whole chapter list (e.g. the
    // "Gouken no Frieren" doujinshi absorbing Sousou no Frieren's 200+ ch).
    if (!md.length) return matchScore >= 85 ? collected : md;

    // Thin MD feed → merge only if the mirror's span is plausible for THIS
    // series. Guards against polluting a short side-story/doujinshi entry
    // with the main series' 100+ chapters that fuzzy search matched.
    const maxNum = (list: MangaChapter[]) =>
      Math.max(...list.map((c) => parseFloat(c.number) || 0));
    const expected = lastChapter
      ? (parseFloat(lastChapter) || 0) * 1.5 + 3
      : maxNum(md) + 5;
    if (maxNum(collected) > expected) return md;

    return mergeChapters(md, collected);
  });
}
