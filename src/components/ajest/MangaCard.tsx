'use client';

// ── MangaCard — poster-style card for manga / manhwa / manhua ────────────────
// Mirrors AnimeCard's look (2:3 cover, hover lift, progress bar) so both
// media read as one product.

import { memo } from 'react';
import type { MangaHistoryEntry, MangaItem } from '@/lib/ajest/types';
import { mangaOriginLabel } from '@/lib/ajest/manga';
import { IconBook, IconStar } from './icons';

interface Props {
  manga: MangaItem;
  onOpen: (m: MangaItem) => void;
  historyEntry?: MangaHistoryEntry;
  compact?: boolean;
}

function CoverImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-[#1a1f2b] to-[#232a3a] ${className || ''}`}>
        <IconBook className="text-[#39415a]" size={30} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`h-full w-full object-cover ${className || ''}`}
      draggable={false}
      referrerPolicy="no-referrer"
    />
  );
}

function MangaCardBase({ manga, onOpen, historyEntry, compact }: Props) {
  const origin = mangaOriginLabel(manga.origin);
  const progressPct =
    historyEntry && historyEntry.pages > 0
      ? Math.min(100, ((historyEntry.page + 1) / historyEntry.pages) * 100)
      : 0;

  return (
    <button
      onClick={() => onOpen(manga)}
      className="aj-card-hover group relative w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aj-acc)] rounded-xl"
      aria-label={`Open ${manga.title}`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-[#171b24] ring-1 ring-white/[0.07] group-hover:ring-[var(--aj-acc-50)] transition-shadow">
        <CoverImage src={manga.cover} alt={manga.title} className="transition-transform duration-500 group-hover:scale-[1.07]" />

        {/* top badges */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1.5">
          {origin ? (
            <span className="rounded-md bg-black/75 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider text-white/85 backdrop-blur">
              {origin.toUpperCase()}
            </span>
          ) : (
            <span />
          )}
          {manga.rating !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-[var(--aj-acc-hi)] backdrop-blur">
              <IconStar size={10} filled /> {manga.rating.toFixed(1)}
            </span>
          )}
        </div>

        {/* hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--aj-acc)] text-black shadow-[0_0_30px_var(--aj-acc-shadow)] scale-75 transition-transform duration-300 group-hover:scale-100">
            <IconBook size={20} />
          </span>
        </div>

        {/* reading progress bar (history) */}
        {progressPct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3.5px] bg-white/15">
            <div className="h-full bg-[var(--aj-acc)]" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      <div className="mt-2 px-0.5">
        <h3 className={`font-semibold leading-snug text-[13.5px] text-white/92 line-clamp-2 group-hover:text-[var(--aj-acc-hi)] transition-colors ${compact ? 'text-[12.5px]' : ''}`}>
          {manga.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-white/40 line-clamp-1">
          {manga.lastChapter ? `Ch ${manga.lastChapter}` : mangaStatusLabelSafe(manga.status)}
          {manga.year ? ` · ${manga.year}` : ''}
        </p>
      </div>
    </button>
  );
}

function mangaStatusLabelSafe(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export const MangaCard = memo(MangaCardBase);

export function MangaCardSkeleton() {
  return (
    <div className="w-full">
      <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-white/[0.05]" />
      <div className="mt-2 h-3.5 w-4/5 animate-pulse rounded bg-white/[0.05]" />
    </div>
  );
}
