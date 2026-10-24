'use client';

// ── Drama Explore — full-catalog listing with filter changer ────────────────
// Lists EVERY drama matching the selected filters (30 per page, paginated)
// via the dramacool /explore SSR endpoint: country / genre / status / type /
// year + sort. Single-select per axis (upstream API contract), sort chips,
// compact pagination — the drama-side twin of the anime Browse view.

import { useEffect, useMemo, useState } from 'react';
import type { DramaItem } from '@/lib/ajest/types';
import { fetchDramaExplore } from '@/lib/ajest/client';
import { AnimeCard } from './AnimeCard';
import { dramaAsCard } from './DramaHome';
import { IconFilter, IconChevronLeft, IconChevronRight, IconClose, IconLoader, IconFlame } from './icons';

export interface DramaExplorePreset {
  country?: string;
  genre?: string;
  status?: string;
  type?: string;
  sort?: string;
  title?: string;
}

/** Curated genre chips — exact upstream taxonomy casing. */
export const DRAMA_GENRES = [
  'Romance', 'Comedy', 'melodrama', 'Action', 'Fantasy', 'Thriller', 'Mystery',
  'Historical', 'Supernatural', 'Horror', 'Family', 'Youth', 'School', 'Medical',
  'Law', 'Business', 'Military', 'political', 'Food', 'Sports', 'Sci-fi',
  'Adventure', 'Friendship', 'Revenge', 'Time Travel', 'Martial Arts', 'Wuxia',
  'Workplace', 'Music', 'Slice of Life', 'Crime', 'Documentary',
] as const;

const DRAMA_COUNTRIES = ['South Korea', 'China', 'Japan', 'Thailand', 'Hong Kong', 'Taiwan', 'Philippines'] as const;
const DRAMA_STATUS = ['Ongoing', 'Completed', 'Upcoming'] as const;
const DRAMA_SORTS: { id: string; label: string }[] = [
  { id: 'most_popular', label: 'Most popular' },
  { id: 'recent', label: 'Recently updated' },
  { id: 'top_rated', label: 'Top rated' },
];

interface Props {
  preset?: DramaExplorePreset;
  onOpen: (d: DramaItem) => void;
  /** Optional shortcut into the Netflix Exclusives catalog */
  onNetflix?: () => void;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aj-acc)] ${
        on
          ? 'bg-[var(--aj-acc)] text-black'
          : 'border border-white/[0.09] bg-white/[0.04] text-white/60 hover:border-[var(--aj-acc-40)] hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export function DramaExploreView({ preset, onOpen, onNetflix }: Props) {
  const [country, setCountry] = useState(preset?.country || '');
  const [genre, setGenre] = useState(preset?.genre || '');
  const [status, setStatus] = useState(preset?.status || '');
  const [sort, setSort] = useState(preset?.sort || 'most_popular');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchDramaExplore>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title = preset?.title || 'Explore Dramas';

  useEffect(() => {
    let cancelled = false;
    const kick = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchDramaExplore({ country: country || undefined, genre: genre || undefined, status: status || undefined, sort, page })
        .then((d) => {
          if (cancelled) return;
          if (d.ok) setData(d);
          else {
            setData(null);
            setError(d.error || 'Explore is unavailable right now.');
          }
        })
        .catch(() => !cancelled && setError('Could not reach the drama source.'))
        .finally(() => !cancelled && setLoading(false));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(kick);
    };
  }, [country, genre, status, sort, page]);

  const setFilter = (apply: () => void) => {
    setPage(1);
    apply();
  };

  const filtersActive = !!(country || genre || status);
  const pageInfo = data?.pageInfo;
  const items = useMemo(() => data?.items || [], [data]);

  const pageWindow = useMemo(() => {
    if (!pageInfo?.totalPages) return [] as number[];
    const last = pageInfo.totalPages;
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
        {pageInfo && pageInfo.totalPages > 0 && (
          <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11.5px] font-semibold text-white/55">
            Page {pageInfo.currentPage} / {pageInfo.totalPages.toLocaleString()}
          </span>
        )}
        {filtersActive && (
          <button
            onClick={() =>
              setFilter(() => {
                setCountry('');
                setGenre('');
                setStatus('');
              })
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11.5px] font-semibold text-white/55 transition hover:border-[var(--aj-acc-40)] hover:text-white"
          >
            <IconClose size={12} /> Clear filters
          </button>
        )}
        {onNetflix && (
          <button
            onClick={onNetflix}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#e50914]/40 bg-[#e50914]/10 px-3 py-1.5 text-[11.5px] font-bold text-[#ff6b70] transition hover:border-[#e50914]/70 hover:bg-[#e50914]/20"
          >
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] bg-gradient-to-b from-[#e50914] to-[#7d0009] text-[8px] font-black leading-none text-white">
              N
            </span>
            Netflix Exclusives
          </button>
        )}
      </div>

      {/* Filter changer — country / genre / status + sort */}
      <div className="mb-4 space-y-2.5 rounded-2xl border border-white/[0.06] bg-[#11141c]/70 p-4">
        <div>
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">Country</p>
          <div className="flex flex-wrap gap-1.5">
            {DRAMA_COUNTRIES.map((c) => (
              <Chip key={c} on={country === c} onClick={() => setFilter(() => setCountry(country === c ? '' : c))}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">Genre</p>
          <div className="flex flex-wrap gap-1.5">
            {DRAMA_GENRES.map((gr) => (
              <Chip key={gr} on={genre === gr} onClick={() => setFilter(() => setGenre(genre === gr ? '' : gr))}>
                {gr}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {DRAMA_STATUS.map((st) => (
              <Chip key={st} on={status === st} onClick={() => setFilter(() => setStatus(status === st ? '' : st))}>
                {st}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">Sort</p>
          <div className="flex flex-wrap gap-1.5">
            {DRAMA_SORTS.map((s) => (
              <Chip key={s.id} on={sort === s.id} onClick={() => setFilter(() => setSort(s.id))}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#14171f] py-16 text-white/55">
          <IconFlame size={26} className="text-[#ff6b70]" />
          <p className="text-sm">{error}</p>
          <button onClick={() => setPage(1)} className="rounded-full bg-[var(--aj-acc)] px-5 py-2 text-[12.5px] font-bold text-black">
            Try again
          </button>
        </div>
      ) : loading && !items.length ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/50">
          <IconLoader size={30} className="aj-spin text-[var(--aj-acc)]" />
          <p className="text-sm">Filtering the catalog…</p>
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 ${loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}`}>
            {items.map((d) => (
              <AnimeCard key={d.slug} anime={dramaAsCard(d)} onOpen={() => onOpen(d)} />
            ))}
          </div>
          {!items.length && (
            <p className="py-10 text-center text-sm text-white/45">No dramas match these filters.</p>
          )}

          {/* Pagination */}
          {pageInfo && pageInfo.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageInfo.currentPage <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:border-[var(--aj-acc-40)] hover:text-white disabled:opacity-30 disabled:hover:border-white/10"
                aria-label="Previous page"
              >
                <IconChevronLeft size={16} />
              </button>
              {pageWindow.map((n, i) => {
                const prev = pageWindow[i - 1];
                const gap = prev !== undefined && n - prev > 1;
                return (
                  <span key={n} className="flex items-center gap-1.5">
                    {gap && <span className="px-0.5 text-white/30">…</span>}
                    <button
                      onClick={() => setPage(n)}
                      aria-current={pageInfo.currentPage === n ? 'page' : undefined}
                      className={`h-9 min-w-[36px] rounded-full px-2 text-[12.5px] font-bold transition ${
                        pageInfo.currentPage === n
                          ? 'bg-[var(--aj-acc)] text-black'
                          : 'border border-white/10 text-white/65 hover:border-[var(--aj-acc-40)] hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  </span>
                );
              })}
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!pageInfo.hasNext}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:border-[var(--aj-acc-40)] hover:text-white disabled:opacity-30 disabled:hover:border-white/10"
                aria-label="Next page"
              >
                <IconChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
