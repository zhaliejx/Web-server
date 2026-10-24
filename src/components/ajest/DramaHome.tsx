'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AnimeCard as AnimeCardType, DramaHistoryEntry, DramaItem } from '@/lib/ajest/types';
import { fetchDramaCatalog } from '@/lib/ajest/client';
import { useDramaHistory, dramaHistorySorted } from '@/lib/ajest/dramastore';
import { Row } from './Row';
import { AnimeCard } from './AnimeCard';
import { IconClock, IconFlame, IconLoader, IconSparkle } from './icons';

/** DramaItem → pseudo AnimeCard so the shared Row/AnimeCard rails render it */
export function dramaAsCard(d: DramaItem): AnimeCardType {
  return {
    id: `dc:${d.slug}`,
    title: d.title,
    cover: d.cover,
    format: 'DRAMA',
    seasonYear: d.year ? parseInt(d.year, 10) || undefined : undefined,
    status: d.status,
  };
}

// ── Continue Watching rail (drama history) ───────────────────────────────────
function DramaContinueRow({ onOpen, onPlay }: { onOpen: (d: DramaItem) => void; onPlay: (d: DramaItem, ep: number) => void }) {
  const entries = useDramaHistory((s) => s.entries);
  const sorted = useMemo(() => dramaHistorySorted(entries).slice(0, 14), [entries]);
  if (!sorted.length) return null;
  return (
    <section className="aj-rise" aria-label="Continue watching">
      <div className="mb-3 flex items-center gap-2.5 px-4 md:px-8">
        <span className="text-[var(--aj-acc)]">
          <IconClock size={19} />
        </span>
        <h2 className="text-[17px] md:text-xl font-bold tracking-tight text-white/95">Continue Watching</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 md:gap-4 md:px-8" style={{ scrollbarWidth: 'none' }}>
        {sorted.map((h: DramaHistoryEntry) => {
          const card = dramaAsCard(h.drama);
          return (
            <div key={h.drama.slug} className="w-[128px] shrink-0 sm:w-[142px]">
              <AnimeCard anime={card} onOpen={() => onOpen(h.drama)} />
              <button
                onClick={() => onPlay(h.drama, h.episode.number)}
                className="mt-1.5 w-full rounded-lg bg-[var(--aj-acc-12)] px-2 py-1 text-[10.5px] font-bold text-[var(--aj-acc-hi)] ring-1 ring-[var(--aj-acc-25)] transition hover:bg-[var(--aj-acc-25)]"
              >
                ▶ EP {h.episode.number}
                {h.progress > 30 ? ' · resume' : ''}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Drama home ───────────────────────────────────────────────────────────────
interface DramaHomeProps {
  onOpen: (d: DramaItem) => void;
  onPlay: (d: DramaItem, ep: number) => void;
  /** Deep-link into the Explore view (optionally with a preset) */
  onExplore: (preset?: { country?: string; genre?: string; status?: string; sort?: string; title?: string }) => void;
}

/** Country quick-access strip — one tap into a filtered Explore grid. */
const QUICK_COUNTRIES: { label: string; country: string }[] = [
  { label: 'K-Drama', country: 'South Korea' },
  { label: 'C-Drama', country: 'China' },
  { label: 'J-Drama', country: 'Japan' },
  { label: 'Lakorn', country: 'Thailand' },
  { label: 'Hong Kong', country: 'Hong Kong' },
  { label: 'Taiwan', country: 'Taiwan' },
];

export function DramaHome({ onOpen, onPlay, onExplore }: DramaHomeProps) {
  const [sections, setSections] = useState<{ title: string; items: DramaItem[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDramaCatalog()
      .then((d) => {
        if (cancelled) return;
        setSections(d.sections || []);
        setError(d.ok === false ? 'Drama feed unavailable' : null);
      })
      .catch(() => !cancelled && setError('Could not reach the drama feed'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative z-10 space-y-9 pb-24 pt-6 md:space-y-11">
      {/* Country quick access — straight into filtered Explore grids */}
      <section className="aj-rise" aria-label="Browse dramas by country">
        <div className="mb-3 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2.5">
            <span className="text-[var(--aj-acc)]">
              <IconFlame size={19} />
            </span>
            <h2 className="text-[17px] md:text-xl font-bold tracking-tight text-white/95">Browse by Country</h2>
          </div>
          <button
            onClick={() => onExplore({ title: 'All Dramas' })}
            className="rounded-full bg-[var(--aj-acc-12)] px-3.5 py-1.5 text-[11.5px] font-bold text-[var(--aj-acc-hi)] ring-1 ring-[var(--aj-acc-25)] transition hover:bg-[var(--aj-acc-25)]"
          >
            See all
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar md:px-8">
          {QUICK_COUNTRIES.map((c) => (
            <button
              key={c.country}
              onClick={() => onExplore({ country: c.country, title: c.label })}
              className="shrink-0 rounded-full border border-white/[0.09] bg-white/[0.04] px-4 py-2 text-[12px] font-bold text-white/70 transition hover:border-[var(--aj-acc-40)] hover:bg-[var(--aj-acc-12)] hover:text-white"
            >
              {c.label}
            </button>
          ))}
          <button
            onClick={() => onExplore({ status: 'Ongoing', title: 'Ongoing Now' })}
            className="shrink-0 rounded-full border border-white/[0.09] bg-white/[0.04] px-4 py-2 text-[12px] font-bold text-white/70 transition hover:border-[var(--aj-acc-40)] hover:bg-[var(--aj-acc-12)] hover:text-white"
          >
            Ongoing
          </button>
        </div>
      </section>

      <DramaContinueRow onOpen={onOpen} onPlay={onPlay} />
      {loading && !sections.length ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/50">
          <IconLoader size={32} className="aj-spin text-[var(--aj-acc)]" />
          <p className="text-sm">Loading dramas…</p>
        </div>
      ) : error && !sections.length ? (
        <div className="mx-4 flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#14171f] py-16 text-white/55 md:mx-8">
          <IconFlame size={26} className="text-[#ff6b70]" />
          <p className="text-sm">{error}</p>
          <button onClick={() => window.location.reload()} className="rounded-full bg-[var(--aj-acc)] px-5 py-2 text-[12.5px] font-bold text-black">
            Reload
          </button>
        </div>
      ) : (
        sections.map((s, i) => (
          <Row
            key={s.title}
            title={s.title}
            items={s.items.map(dramaAsCard)}
            onOpen={(a) => onOpen(sectionItem(s, a))}
            icon={i === 1 ? <IconFlame size={19} /> : i === 2 ? <IconSparkle size={19} /> : undefined}
            onSeeAll={() => onExplore({ title: s.title })}
          />
        ))
      )}
    </div>
  );
}

/** Map a pseudo-card click back to its DramaItem (Row passes the card). */
function sectionItem(section: { title: string; items: DramaItem[] }, card: AnimeCardType): DramaItem {
  const slug = card.id.replace(/^dc:/, '');
  const hit = section.items.find((d) => d.slug === slug);
  return hit || { slug, title: card.title, cover: card.cover, source: 'dramacool' };
}
