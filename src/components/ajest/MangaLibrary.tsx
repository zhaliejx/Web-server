'use client';

// ── MangaLibrary — Continue Reading + Saved manga in one view ────────────────

import { useMemo } from 'react';
import type { MangaItem } from '@/lib/ajest/types';
import { useMangaHistory, useMangaSaved, mangaHistorySorted } from '@/lib/ajest/mangastore';
import { MangaCard } from './MangaCard';
import { IconClock, IconBookmark, IconBook } from './icons';

interface Props {
  onOpen: (m: MangaItem) => void;
}

export function MangaLibrary({ onOpen }: Props) {
  const historyEntries = useMangaHistory((s) => s.entries);
  const savedItems = useMangaSaved((s) => s.items);
  const history = useMemo(() => mangaHistorySorted(historyEntries), [historyEntries]);

  const empty = !history.length && !savedItems.length;

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32 text-center text-white/50">
        <IconBook size={34} className="text-white/20" />
        <p className="text-[15px] font-semibold text-white/70">Your shelf is empty</p>
        <p className="max-w-xs text-[13px] text-white/40">
          Start reading anything and it lands here — progress is saved page by page, on this device.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-24 pt-8">
      {history.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2 px-4 md:px-0">
            <IconClock size={19} className="text-[var(--aj-acc)]" />
            <h2 className="text-[15px] font-bold tracking-wide text-white/90 md:text-[16.5px]">Continue Reading</h2>
          </div>
          <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:gap-4 md:px-0">
            {history.map((h) => (
              <div key={h.manga.id} className="w-[130px] shrink-0 snap-start sm:w-[150px] md:w-[168px]">
                <MangaCard manga={h.manga} onOpen={onOpen} historyEntry={h} />
                <p className="mt-1 truncate px-0.5 text-[10.5px] font-semibold text-[var(--aj-acc-hi)]">
                  Ch {h.chapter.number} · Page {h.page + 1}/{h.pages || '?'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {savedItems.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2 px-4 md:px-0">
            <IconBookmark size={18} className="text-[var(--aj-acc)]" />
            <h2 className="text-[15px] font-bold tracking-wide text-white/90 md:text-[16.5px]">Saved</h2>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 px-4 sm:grid-cols-4 md:grid-cols-6 md:px-0">
            {savedItems.map((m) => (
              <MangaCard key={m.id} manga={m} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
