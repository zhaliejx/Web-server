'use client';

// ── MangaRail — horizontal scroll rail of MangaCards (mirrors Row.tsx) ───────

import { useRef, useState, useEffect, useCallback } from 'react';
import type { MangaItem } from '@/lib/ajest/types';
import { MangaCard } from './MangaCard';
import { IconChevronLeft, IconChevronRight } from './icons';

interface Props {
  title: string;
  items: MangaItem[];
  onOpen: (m: MangaItem) => void;
  icon?: React.ReactNode;
}

export function MangaRail({ title, items, onOpen, icon }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);

  const scrollBy = useCallback((dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * Math.max(320, el.clientWidth * 0.8), behavior: 'smooth' });
  }, []);

  if (!items.length) return null;

  return (
    <section
      className="relative"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="mb-3 flex items-center gap-2 px-4 md:px-8">
        {icon && <span className="text-[var(--aj-acc)]">{icon}</span>}
        <h2 className="text-[15px] font-bold tracking-wide text-white/90 md:text-[16.5px]">{title}</h2>
      </div>

      <div className="group relative">
        <div
          ref={scroller}
          className="no-scrollbar flex snap-x gap-3 overflow-x-auto scroll-pl-4 px-4 pb-1 md:gap-4 md:px-8"
        >
          {items.map((m) => (
            <div key={m.id} className="w-[130px] shrink-0 snap-start sm:w-[150px] md:w-[168px]">
              <MangaCard manga={m} onOpen={onOpen} />
            </div>
          ))}
        </div>

        {/* Desktop hover arrows */}
        <button
          onClick={() => scrollBy(-1)}
          aria-label={`Scroll ${title} left`}
          className={`absolute left-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[#0b0d12]/85 text-white shadow-xl ring-1 ring-white/15 backdrop-blur transition-all hover:bg-[#0b0d12] md:flex ${hovering ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <IconChevronLeft size={19} />
        </button>
        <button
          onClick={() => scrollBy(1)}
          aria-label={`Scroll ${title} right`}
          className={`absolute right-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[#0b0d12]/85 text-white shadow-xl ring-1 ring-white/15 backdrop-blur transition-all hover:bg-[#0b0d12] md:flex ${hovering ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <IconChevronRight size={19} />
        </button>
      </div>
    </section>
  );
}
