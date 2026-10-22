// ── Cross-tier chapter resolver — fills the gaps licensed titles leave ──────
// MangaDex legitimately lists some series with ZERO readable English chapters
// (official chapters live off-site, e.g. Solo Leveling → webnovel links, or
// licensed titles removed from MD entirely). When the MD feed comes back
// empty, this resolver finds the same series on the scrape tiers by trying
// every title candidate (display title + alt titles) and returns whichever
// tier actually carries readable chapters:
//   MangaDex feed → MangaRead (by-title match) → MangaPill (by-title match)
// Chapter ids stay namespaced (mrc:/mpc:) so /api/manga/pages dispatches
// transparently — the reader never learns a fallback happened.

import { cached } from './upstream';
import { mangaFeed, mangaTitleCandidates } from './mangadex';
import { pillChapters, pillSearch } from './mangapill';
import { mrChapters, mrSearch } from './mangaread';
import { similar } from './gogo';
import type { MangaChapter } from './types';

/** Best MangaRead series for a set of title candidates. WP search is fuzzy,
 *  so results are ranked against the candidate (slug + title) and must clear
 *  a similarity bar before their chapter list is trusted. */
async function mrSeriesFor(candidates: string[]): Promise<string | null> {
  for (const q of candidates) {
    try {
      const results = await mrSearch(q, 8);
      const ranked = results
        .map((r) => {
          const slug = r.id.split(':')[1] || '';
          return { r, score: Math.max(similar(slug, q), similar(r.title, q)) };
        })
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (!best || best.score < 50) continue;
      return best.r.id;
    } catch {
      /* next candidate */
    }
  }
  return null;
}

/** Same for MangaPill (slug-keyed ids) */
async function pillSeriesFor(candidates: string[]): Promise<string | null> {
  for (const q of candidates) {
    try {
      const results = await pillSearch(q, 8);
      if (!results.length) continue;
      const ranked = results
        .map((r) => ({ r, score: similar(r.id.split(':')[2] || '', q) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      // Pill search matches whole-word titles loosely; require some similarity
      if (best.score < 40) continue;
      return best.r.id;
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

    const collected: MangaChapter[] = [];

    if (candidates.length) {
      // MangaRead first — Madara mirror with the widest licensed coverage
      try {
        const mrId = await mrSeriesFor(candidates);
        if (mrId) {
          const chapters = await mrChapters(mrId);
          if (chapters.length) collected.push(...chapters);
        }
      } catch {
        /* fall through to pill */
      }

      if (!collected.length) {
        try {
          const pillId = await pillSeriesFor(candidates);
          if (pillId) {
            const chapters = await pillChapters(pillId);
            if (chapters.length) collected.push(...chapters);
          }
        } catch {
          /* give up with whatever we have */
        }
      }
    }

    if (!collected.length) return md;

    // Empty MD feed → the mirror IS the series' readable library.
    if (!md.length) return collected;

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
