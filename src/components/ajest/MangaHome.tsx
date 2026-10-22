'use client';

// ── MangaHome — rails for manga / manhwa / manhua (MangaDex tier) ────────────

import { useEffect, useMemo, useState } from 'react';
import type { MangaItem } from '@/lib/ajest/types';
import { fetchMangaCatalog } from '@/lib/ajest/manga';
import { useMangaHistory, mangaHistorySorted } from '@/lib/ajest/mangastore';
import { MangaCard, MangaCardSkeleton } from './MangaCard';
import { MangaRail } from './MangaRail';
import { IconBook, IconFlame, IconGlobe, IconSparkle, IconLoader, IconClock } from './icons';

interface Props {
  onOpen: (m: MangaItem) => void;
}

export function MangaHome({ onOpen }: Props) {
  const [sections, setSections] = useState<Record<string, MangaItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const historyEntries = useMangaHistory((s) => s.entries);
  const continueReading = useMemo(() => mangaHistorySorted(historyEntries).slice(0, 14), [historyEntries]);

  useEffect(() => {
    let cancelled = false;
    fetchMangaCatalog()
      .then((d) => {
        if (cancelled) return;
        setSections(d.sections || {});
        setError(d.ok === false ? 'Manga feed unavailable' : null);
      })
      .catch(() => !cancelled && setError('Could not reach the manga feed'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative z-10 space-y-9 pb-24 pt-6 md:space-y-11">
      {/* Continue Reading — local history, shown first */}
      {continueReading.length > 0 && (
        <section className="relative">
          <div className="mb-3 flex items-center gap-2 px-4 md:px-8">
            <IconClock size={19} className="text-[var(--aj-acc)]" />
            <h2 className="text-[15px] font-bold tracking-wide text-white/90 md:text-[16.5px]">Continue Reading</h2>
          </div>
          <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:gap-4 md:px-8">
            {continueReading.map((h) => (
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

      {loading && !Object.keys(sections).length ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/50">
          <IconLoader size={32} className="aj-spin text-[var(--aj-acc)]" />
          <p className="text-sm">Opening the library…</p>
          <div className="grid w-full max-w-6xl grid-cols-3 gap-3 px-8 pt-6 sm:grid-cols-4 md:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <MangaCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : error && !Object.keys(sections).length ? (
        <div className="mx-4 flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#14171f] py-16 text-white/55 md:mx-8">
          <IconFlame size={26} className="text-[#ff6b70]" />
          <p className="text-sm">{error}</p>
          <button onClick={() => window.location.reload()} className="rounded-full bg-[var(--aj-acc)] px-5 py-2 text-[12.5px] font-bold text-black">
            Reload
          </button>
        </div>
      ) : (
        <>
          <MangaRail title="Trending Manga" items={sections.trending || []} onOpen={onOpen} icon={<IconFlame size={19} />} />
          <MangaRail title="Popular Manhwa" items={sections.manhwa || []} onOpen={onOpen} icon={<IconGlobe size={19} />} />
          <MangaRail title="Action & Thrills" items={sections.action || []} onOpen={onOpen} icon={<IconFlame size={19} />} />
          <MangaRail title="Romance" items={sections.romance || []} onOpen={onOpen} icon={<IconSparkle size={19} />} />
          <MangaRail title="Fantasy Worlds" items={sections.fantasy || []} onOpen={onOpen} icon={<IconBook size={19} />} />
          <MangaRail title="Manhua" items={sections.manhua || []} onOpen={onOpen} icon={<IconGlobe size={19} />} />
          <MangaRail title="Fresh Updates" items={sections.latest || []} onOpen={onOpen} icon={<IconClock size={19} />} />
          <MangaRail title="New Releases" items={sections.new || []} onOpen={onOpen} icon={<IconSparkle size={19} />} />
        </>
      )}
    </div>
  );
}
