'use client';

import { useRef, useState, useEffect } from 'react';
import type { AnimeCard as AnimeCardType, HistoryEntry } from '@/lib/ajest/types';
import { AnimeCard } from './AnimeCard';
import { IconChevronLeft, IconChevronRight } from './icons';
import { useHistory } from '@/lib/ajest/store';

interface RowProps {
  title: string;
  items: AnimeCardType[];
  onOpen: (a: AnimeCardType) => void;
  badge?: string;
  icon?: React.ReactNode;
  subtitle?: string;
}

// Horizontal responsive content rail with SVG scroll arrows
export function Row({ title, items, onOpen, badge, icon, subtitle }: RowProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = () => {
    const el = railRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    updateArrows();
    const el = railRef.current;
    el?.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el?.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [items.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  if (!items.length) return null;

  return (
    <section className="aj-rise group/row relative" aria-label={title}>
      <div className="mb-3 flex items-end justify-between px-4 md:px-8">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-[#ff7a1a]">{icon}</span>}
          <h2 className="text-[17px] md:text-xl font-bold tracking-tight text-white/95">{title}</h2>
          {subtitle && <span className="hidden md:inline text-xs text-white/35 pb-0.5">{subtitle}</span>}
        </div>
        <div className="hidden md:flex items-center gap-1.5 opacity-0 transition-opacity group-hover/row:opacity-100">
          <button
            onClick={() => scrollBy(-1)}
            disabled={!canLeft}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-white/80 transition hover:bg-[#ff7a1a] hover:text-black disabled:opacity-25 disabled:hover:bg-white/[0.07] disabled:hover:text-white/80"
            aria-label={`Scroll ${title} left`}
          >
            <IconChevronLeft size={16} />
          </button>
          <button
            onClick={() => scrollBy(1)}
            disabled={!canRight}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-white/80 transition hover:bg-[#ff7a1a] hover:text-black disabled:opacity-25 disabled:hover:bg-white/[0.07] disabled:hover:text-white/80"
            aria-label={`Scroll ${title} right`}
          >
            <IconChevronRight size={16} />
          </button>
        </div>
      </div>

      <div
        ref={railRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-3 md:gap-4 md:px-8"
      >
        {items.map((a) => (
          <div key={a.id} className="w-[46vw] shrink-0 snap-start sm:w-[30vw] md:w-[21vw] lg:w-[15.5vw] xl:w-[12.5vw]">
            <AnimeCard anime={a} onOpen={onOpen} badge={badge} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Continue Watching rail — History with resume progress ───────────────────
export function ContinueRow({ onOpen }: { onOpen: (a: AnimeCardType) => void }) {
  const entries = useHistory((s) => s.entries);
  const items = Object.values(entries)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 14)
    .map((e) => e.anime);

  if (!items.length) return null;
  return (
    <Row
      title="Continue Watching"
      subtitle="Picks up where you left off"
      items={items}
      onOpen={onOpen}
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5.2l3.4 2" />
        </svg>
      }
    />
  );
}

export { AnimeCard };
export type { HistoryEntry };
