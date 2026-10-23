'use client';

// ── Browse — full-catalog listing with genre/theme filters + sorting ────────
// Lists EVERY anime matching the selected filters (36 per page, paginated),
// so the home rails can stay uncluttered: each rail's "See all" deep-links
// here with its own preset (genre chips pre-applied, sort pre-picked).

import { useEffect, useMemo, useState } from 'react';
import type { AnimeCard as AnimeCardType } from '@/lib/ajest/types';
import { fetchBrowse } from '@/lib/ajest/client';
import { BROWSE_GENRES, BROWSE_THEMES, BROWSE_SORTS, type BrowseSort } from '@/lib/ajest/genres';
import { AnimeCard, CardSkeleton } from './AnimeCard';
import { IconFilter, IconRefresh, IconChevronLeft, IconChevronRight, IconClose } from './icons';

export interface BrowsePreset {
  genres?: string[];
  tags?: string[];
  sort?: BrowseSort;
  title?: string;
}

interface Props {
  preset?: BrowsePreset;
  onOpen: (a: AnimeCardType) => void;
}

export function BrowseView({ preset, onOpen }: Props) {
  const [genres, setGenres] = useState<string[]>(preset?.genres || []);
  const [tags, setTags] = useState<string[]>(preset?.tags || []);
  const [sort, setSort] = useState<BrowseSort>(preset?.sort || 'trending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchBrowse>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const title = preset?.title || 'Browse Anime';

  // Any filter/sort change resets to page 1 — done in the handlers below
  // (no setState-in-effect), and each preset mounts a fresh view via key.

  useEffect(() => {
    let cancelled = false;
    const kick = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchBrowse({ genres, tags, sort, page })
        .then((d) => {
          if (cancelled) return;
          if (d.ok) setData(d);
          else {
            setData(null);
            setError(d.error || 'Browse is unavailable right now.');
          }
        })
        .catch(() => !cancelled && setError('Could not reach the browse feed.'))
        .finally(() => !cancelled && setLoading(false));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(kick);
    };
  }, [genres, tags, sort, page, reloadTick]);

  const toggleGenre = (g: string) => {
    setPage(1);
    setGenres((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  };
  const toggleTag = (t: string) => {
    setPage(1);
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  };
  const changeSort = (s: BrowseSort) => {
    setPage(1);
    setSort(s);
  };

  const filtersActive = genres.length + tags.length > 0;
  const pageInfo = data?.pageInfo;
  const items = useMemo(() => data?.items || [], [data]);

  const pageWindow = useMemo(() => {
    // Compact page numbers: 1 … around current … last
    if (!pageInfo?.lastPage) return [] as number[];
    const last = pageInfo.lastPage;
    const cur = pageInfo.currentPage;
    const set = new Set<number>([1, last, cur - 1, cur, cur + 1]);
    if (cur <= 3) [2, 3, 4].forEach((n) => set.add(n));
    if (cur >= last - 2) [last - 3, last - 2, last - 1].forEach((n) => set.add(n));
    return [...set].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  }, [pageInfo]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-white">
          <IconFilter size={20} className="text-[var(--aj-acc)]" /> {title}
        </h1>
        {pageInfo && pageInfo.total > 0 && (
          <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11.5px] font-semibold text-white/55">
            {pageInfo.total.toLocaleString()} titles
          </span>
        )}
      </div>

      {/* Filter changer — genres + themes chips, multi-select (AND) */}
      <div className="mb-3 flex items-start gap-2.5">
        <div className="flex-1 space-y-2.5">
          <div>
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">Genres</p>
            <div className="flex flex-wrap gap-1.5">
              {BROWSE_GENRES.map((g) => {
                const on = genres.includes(g);
                return (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    aria-pressed={on}
                    className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aj-acc)] ${
                      on
                        ? 'bg-[var(--aj-acc)] text-black shadow'
                        : 'bg-white/[0.05] text-white/65 ring-1 ring-white/10 hover:bg-white/[0.1] hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">Themes</p>
            <div className="flex flex-wrap gap-1.5">
              {BROWSE_THEMES.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTag(t)}
                    aria-pressed={on}
                    className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aj-acc)] ${
                      on
                        ? 'bg-[var(--aj-acc)] text-black shadow'
                        : 'bg-white/[0.05] text-white/65 ring-1 ring-white/10 hover:bg-white/[0.1] hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sort changer */}
        <div className="relative shrink-0">
          <label className="sr-only" htmlFor="browse-sort">Sort results</label>
          <select
            id="browse-sort"
            value={sort}
            onChange={(e) => changeSort(e.target.value as BrowseSort)}
            className="appearance-none rounded-full bg-white/[0.06] py-2 pl-3.5 pr-8 text-[12px] font-semibold text-white/85 ring-1 ring-white/10 transition hover:ring-[var(--aj-acc-40)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aj-acc)]"
          >
            {BROWSE_SORTS.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#14171f] text-white">
                {s.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/45">
            <IconChevronDownInline />
          </span>
        </div>
      </div>

      {/* Active-filter summary + clear */}
      {filtersActive && (
        <div className="mb-4 flex items-center gap-2">
          <p className="text-[11.5px] text-white/40">
            Listing every anime matching {[...genres, ...tags].join(' + ')} · {BROWSE_SORTS.find((s) => s.id === sort)?.label}
          </p>
          <button
            onClick={() => {
              setGenres([]);
              setTags([]);
            }}
            className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/65 transition hover:bg-white/[0.12] hover:text-white"
          >
            <IconClose size={11} /> Clear filters
          </button>
        </div>
      )}

      {/* Results grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 24 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#14171f] py-16 text-white/55">
          <IconRefresh size={24} />
          <p className="text-sm">{error}</p>
          <button
            onClick={() => setReloadTick((t) => t + 1)}
            className="rounded-full bg-[var(--aj-acc)] px-5 py-2 text-[12.5px] font-bold text-black"
          >
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-[#14171f] py-16 text-white/50">
          <IconFilter size={24} />
          <p className="text-sm">Nothing matches that combination — try removing a filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
          {items.map((a) => (
            <AnimeCard key={a.id} anime={a} onOpen={onOpen} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pageInfo && pageInfo.lastPage > 1 && !loading && !error && (
        <div className="mt-8 flex items-center justify-center gap-1.5">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/75 transition enabled:hover:bg-[var(--aj-acc)] enabled:hover:text-black disabled:opacity-25"
            aria-label="Previous page"
          >
            <IconChevronLeft size={15} />
          </button>
          {pageWindow.map((n, i) => (
            <span key={n} className="flex items-center">
              {i > 0 && n - pageWindow[i - 1] > 1 && <span className="px-1 text-white/30">…</span>}
              <button
                onClick={() => setPage(n)}
                aria-current={n === page ? 'page' : undefined}
                className={`h-9 min-w-[36px] rounded-full px-2 text-[12.5px] font-bold transition ${
                  n === page
                    ? 'bg-[var(--aj-acc)] text-black shadow'
                    : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white'
                }`}
              >
                {n}
              </button>
            </span>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(pageInfo.lastPage, p + 1))}
            disabled={!pageInfo.hasNextPage}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/75 transition enabled:hover:bg-[var(--aj-acc)] enabled:hover:text-black disabled:opacity-25"
            aria-label="Next page"
          >
            <IconChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function IconChevronDownInline() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  );
}
