'use client';

// ── My Dramas — continue-watching library ────────────────────────────────────
// Full grid of every drama with watch progress: resume straight into the last
// episode (watch-time aware via the Player), open the series page, or drop
// entries. Drama-side twin of the anime History library.

import { useMemo } from 'react';
import type { DramaItem } from '@/lib/ajest/types';
import { useDramaHistory, dramaHistorySorted } from '@/lib/ajest/dramastore';
import { AnimeCard } from './AnimeCard';
import { dramaAsCard } from './DramaHome';
import { IconClock, IconPlay, IconClose } from './icons';

interface Props {
  onOpen: (d: DramaItem) => void;
  onPlay: (d: DramaItem, ep: number) => void;
}

export function fmtWatched(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function DramaHistoryView({ onOpen, onPlay }: Props) {
  const entries = useDramaHistory((s) => s.entries);
  const remove = useDramaHistory((s) => s.remove);
  const sorted = useMemo(() => dramaHistorySorted(entries), [entries]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-white">
          <IconClock size={20} className="text-[var(--aj-acc)]" /> My Dramas
        </h1>
        {sorted.length > 0 && (
          <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11.5px] font-semibold text-white/55">
            {sorted.length} series
          </span>
        )}
      </div>

      {!sorted.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#14171f] py-16 text-white/55">
          <IconClock size={26} className="text-white/30" />
          <p className="text-sm">Nothing here yet — press play on any drama and it lands here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
          {sorted.map((h) => {
            const card = dramaAsCard(h.drama);
            const pct = h.durationSec > 0 ? Math.min(100, Math.round((h.progress / h.durationSec) * 100)) : 0;
            return (
              <div key={h.drama.slug} className="relative">
                <AnimeCard anime={card} onOpen={() => onOpen(h.drama)} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(h.drama.slug);
                  }}
                  className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white/70 transition hover:bg-black/90 hover:text-white"
                  aria-label={`Remove ${h.drama.title} from My Dramas`}
                >
                  <IconClose size={11} />
                </button>
                <div className="mt-1.5 space-y-1">
                  <button
                    onClick={() => onPlay(h.drama, h.episode.number)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--aj-acc-12)] px-2 py-1.5 text-[10.5px] font-bold text-[var(--aj-acc-hi)] ring-1 ring-[var(--aj-acc-25)] transition hover:bg-[var(--aj-acc-25)]"
                  >
                    <IconPlay size={11} /> EP {h.episode.number}
                    {pct > 0 ? ` · ${pct}%` : ''}
                  </button>
                  {h.progress > 30 && (
                    <p className="text-center text-[9.5px] font-medium text-white/35">{fmtWatched(h.progress)} watched</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
