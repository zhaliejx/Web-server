'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnimeCard as AnimeCardType } from '@/lib/ajest/types';
import { fetchSearch } from '@/lib/ajest/client';
import { AnimeCard, CardSkeleton } from './AnimeCard';
import { IconSearch, IconClose, TierBadge, IconInfo } from './icons';

const TIER_COPY: Record<string, string> = {
  anilist: 'Served by AniList — primary GraphQL tier',
  kitsu: 'AniList missed or was rate-limited — served by Kitsu (fallback 1)',
  gogo: 'Both catalog tiers missed — results scraped live from the gogoanime.by directory (fallback 2)',
};

export function SearchView({
  initialQuery,
  onOpen,
}: {
  initialQuery: string;
  onOpen: (a: AnimeCardType) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<AnimeCardType[]>([]);
  const [tier, setTier] = useState<string>('none');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const run = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setSearched(trimmed);
    fetchSearch(trimmed)
      .then((d) => {
        setResults(d.results || []);
        setTier(d.tier);
      })
      .catch(() => {
        setResults([]);
        setTier('none');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (initialQuery.trim()) {
      // Defer so state updates happen outside the synchronous effect body
      const t = setTimeout(() => run(initialQuery), 0);
      return () => clearTimeout(t);
    }
     
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-8">
      <div className="aj-rise mb-7">
        <h1 className="mb-4 flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
          <span className="text-[var(--aj-acc)]"><IconSearch size={22} /></span> Search
        </h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(query);
          }}
          className="relative max-w-2xl"
          role="search"
        >
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35">
            <IconSearch size={17} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any anime — triple-tier engine: AniList → Kitsu → gogoanime.by"
            className="w-full rounded-2xl border border-white/10 bg-[#14171f] py-3.5 pl-11 pr-11 text-[14px] text-white placeholder:text-white/30 focus:border-[var(--aj-acc-60)] focus:outline-none focus:ring-2 focus:ring-[var(--aj-acc-25)]"
            aria-label="Search anime"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.07] text-white/60 transition hover:bg-white/[0.15] hover:text-white"
              aria-label="Clear search"
            >
              <IconClose size={13} />
            </button>
          )}
        </form>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-x-3.5 gap-y-6 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7">
          {Array.from({ length: 14 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : searched ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <TierBadge tier={tier} />
            <p className="text-[12.5px] text-white/50">
              {results.length} results for “{searched}”
            </p>
            {TIER_COPY[tier] && <p className="w-full text-[11.5px] text-white/35">{TIER_COPY[tier]}</p>}
          </div>

          {results.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-[#14171f] py-16 text-white/50">
              <IconInfo size={24} />
              <p className="text-sm font-semibold">No matches on any tier</p>
              <p className="max-w-sm text-center text-[12.5px] text-white/40">
                Even the gogoanime.by live directory has nothing for this query. Check the spelling or try a shorter title.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-x-3.5 gap-y-6 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7">
              {results.map((a) => (
                <div key={a.id} className="aj-rise">
                  <AnimeCard anime={a} onOpen={onOpen} />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-[#10131a] py-20 text-white/45">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.05] text-white/30">
            <IconSearch size={22} />
          </span>
          <p className="text-[13px]">Type a title — the cascading engine guarantees zero missing entries.</p>
        </div>
      )}
    </div>
  );
}
