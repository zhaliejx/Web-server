'use client';

// ── MangaSearchView — debounced MangaDex title search ────────────────────────

import { useEffect, useRef, useState } from 'react';
import type { MangaItem } from '@/lib/ajest/types';
import { fetchMangaSearch } from '@/lib/ajest/manga';
import { MangaCard, MangaCardSkeleton } from './MangaCard';
import { IconSearch, IconLoader, IconBook } from './icons';

interface Props {
  onOpen: (m: MangaItem) => void;
}

export function MangaSearchView({ onOpen }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MangaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus like the anime search view
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    // All state changes happen inside the timer callback (never synchronously
    // in the effect body) — an empty query resolves immediately.
    const t = setTimeout(() => {
      if (!q) {
        setResults([]);
        setSearched(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      fetchMangaSearch(q)
        .then((d) => setResults(d.results || []))
        .catch(() => setResults([]))
        .finally(() => {
          setLoading(false);
          setSearched(true);
        });
    }, q ? 420 : 0);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="mx-auto max-w-6xl pb-24 pt-8 md:px-8">
      <div className="px-4 md:px-0">
        <h1 className="text-[22px] font-extrabold text-white md:text-[26px]">Search manga</h1>
        <p className="mt-1 text-[13px] text-white/45">
          Every manga, manhwa and manhua on MangaDex — English releases only.
        </p>
      </div>

      <div className="mt-5 px-4 md:px-0">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.09] bg-[#14171f] px-4 py-3 transition focus-within:border-[var(--aj-acc-50)] focus-within:ring-2 focus-within:ring-[var(--aj-acc-25)]">
          <IconSearch size={17} className="shrink-0 text-white/40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try Solo Leveling, One Piece, Omniscient Reader…"
            className="w-full bg-transparent text-[14px] text-white placeholder:text-white/30 focus:outline-none"
            aria-label="Search manga"
          />
          {loading && <IconLoader size={16} className="aj-spin shrink-0 text-[var(--aj-acc)]" />}
          {!loading && query && (
            <button onClick={() => setQuery('')} className="shrink-0 text-[11.5px] font-semibold text-white/45 hover:text-white" aria-label="Clear search">
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mt-7 px-4 md:px-0">
        {loading && !results.length ? (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <MangaCardSkeleton key={i} />
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6">
            {results.map((m) => (
              <MangaCard key={m.id} manga={m} onOpen={onOpen} />
            ))}
          </div>
        ) : searched && query.trim() ? (
          <div className="flex flex-col items-center gap-2 py-20 text-white/45">
            <IconBook size={26} className="text-white/25" />
            <p className="text-sm">Nothing matched “{query.trim()}”</p>
            <p className="text-xs text-white/30">Try the original title or a shorter phrase.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
