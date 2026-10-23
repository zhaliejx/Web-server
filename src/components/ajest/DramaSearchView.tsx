'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnimeCard as AnimeCardType, DramaItem } from '@/lib/ajest/types';
import { fetchDramaSearch } from '@/lib/ajest/client';
import { AnimeCard } from './AnimeCard';
import { IconLoader, IconSearch } from './icons';
import { dramaAsCard } from './DramaHome';

/** Drama search — same tile grid as anime search, powered by /api/drama/search. */
export function DramaSearchView({ onOpen }: { onOpen: (d: DramaItem) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DramaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(() => {
      if (q.length < 2) {
        setResults([]);
        setSearched(false);
        setError(null);
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      fetchDramaSearch(q)
        .then((d) => {
          if (ctrl.signal.aborted) return;
          setResults(d.results || []);
          setSearched(true);
          setError(d.ok === false ? (d as { error?: string }).error || 'Search failed' : null);
        })
        .catch(() => !ctrl.signal.aborted && setError('Could not reach the drama search'))
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 420);
    return () => clearTimeout(t);
  }, [query]);

  const cards = results.map(dramaAsCard);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-8">
      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
        <IconSearch size={17} className="shrink-0 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search K-dramas, C-dramas, Thai & Japanese series…"
          autoFocus
          className="w-full bg-transparent text-[14px] text-white outline-none placeholder:text-white/30"
          aria-label="Search dramas"
        />
        {loading && <IconLoader size={17} className="aj-spin shrink-0 text-[var(--aj-acc)]" />}
      </div>

      {error && (
        <p className="mt-6 text-center text-[13px] text-[#ff6b70]">{error}</p>
      )}

      {!error && cards.length > 0 && (
        <div className="mt-7 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
          {cards.map((c: AnimeCardType) => (
            <AnimeCard
              key={c.id}
              anime={c}
              onOpen={() => onOpen(results.find((d) => `dc:${d.slug}` === c.id) as DramaItem)}
            />
          ))}
        </div>
      )}

      {searched && !loading && !cards.length && !error && (
        <p className="mt-14 text-center text-sm text-white/40">No dramas matched “{query.trim()}”.</p>
      )}

      {!searched && !loading && (
        <p className="mt-14 text-center text-[13px] text-white/35">
          Type at least 2 characters — results come from the Dramacool tier.
        </p>
      )}
    </div>
  );
}
