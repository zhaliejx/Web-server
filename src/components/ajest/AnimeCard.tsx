'use client';

import { memo } from 'react';
import type { AnimeCard as AnimeCardType, HistoryEntry } from '@/lib/ajest/types';
import { IconStar, IconPlay, IconClock, IconHeart, IconBookmark, IconLoader } from './icons';
import { fmtDuration } from '@/lib/ajest/client';

interface Props {
  anime: AnimeCardType;
  onOpen: (a: AnimeCardType) => void;
  historyEntry?: HistoryEntry;
  compact?: boolean;
  badge?: string;
}

function PosterImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-[#1a1f2b] to-[#232a3a] ${className || ''}`}>
        <IconFilm2 className="text-[#39415a]" />
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
    />
  );
}

function IconFilm2({ className }: { className?: string }) {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" />
    </svg>
  );
}

function AnimeCardBase({ anime, onOpen, historyEntry, compact, badge }: Props) {
  const progressPct =
    historyEntry && historyEntry.durationSec > 0
      ? Math.min(100, (historyEntry.progress / historyEntry.durationSec) * 100)
      : historyEntry && historyEntry.progress > 0
        ? Math.min(90, 25 + (historyEntry.progress / 60) * 1.5)
        : 0;

  return (
    <button
      onClick={() => onOpen(anime)}
      className="aj-card-hover group relative w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a1a] rounded-xl"
      aria-label={`Open ${anime.title}`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-[#171b24] ring-1 ring-white/[0.07] group-hover:ring-[#ff7a1a]/50 transition-shadow">
        <PosterImage src={anime.cover} alt={anime.title} className="transition-transform duration-500 group-hover:scale-[1.07]" />

        {/* top badges */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1.5">
          {badge ? (
            <span className="rounded-md bg-[#ff7a1a] px-1.5 py-0.5 text-[10px] font-bold text-black shadow-lg">
              {badge}
            </span>
          ) : (
            <span />
          )}
          {anime.duration ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-semibold text-white/90">
              <IconClock size={9} strokeWidth={2.4} />
              {fmtDuration(anime.duration)}
            </span>
          ) : null}
        </div>

        {/* hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ff7a1a] text-black shadow-[0_0_30px_rgba(255,122,26,0.55)] scale-75 transition-transform duration-300 group-hover:scale-100">
            <IconPlay size={20} />
          </span>
        </div>

        {/* score */}
        {anime.score ? (
          <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-semibold text-[#ffc46b]">
            <IconStar size={9} filled />
            {(anime.score / 10).toFixed(1)}
          </div>
        ) : null}

        {/* watch progress bar (History) */}
        {progressPct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3.5px] bg-white/15">
            <div className="h-full bg-[#ff7a1a]" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      <div className="mt-2 px-0.5">
        <h3 className={`font-semibold leading-snug text-[13.5px] text-white/92 line-clamp-2 group-hover:text-[#ffb37a] transition-colors ${compact ? 'text-[12.5px]' : ''}`}>
          {anime.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-white/40 line-clamp-1">
          {[anime.format?.replace('_', ' '), anime.seasonYear, anime.episodes ? `${anime.episodes} eps` : null]
            .filter(Boolean)
            .join(' · ') || anime.studio || 'Anime'}
        </p>
      </div>
    </button>
  );
}

export const AnimeCard = memo(AnimeCardBase);

// ── Detail-page episode row with exact duration from API metadata ───────────
export function EpisodeItem({
  number,
  title,
  durationMin,
  thumbnail,
  onPlay,
  progressPct,
  airingAt,
  now,
}: {
  number: number;
  title?: string;
  durationMin: number;
  thumbnail?: string;
  onPlay: () => void;
  progressPct?: number;
  airingAt?: number;
  now?: number;
}) {
  const unreleased = airingAt && now && airingAt * 1000 > now;
  return (
    <button
      onClick={unreleased ? undefined : onPlay}
      disabled={!!unreleased}
      className={`group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-[#14171f] p-2 text-left transition-colors ${
        unreleased
          ? 'cursor-not-allowed opacity-45'
          : 'hover:border-[#ff7a1a]/50 hover:bg-[#1a1f2b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a1a]'
      }`}
      aria-label={unreleased ? `Episode ${number} not yet released` : `Play episode ${number}`}
    >
      <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-[#1c212c]">
        {thumbnail ? (
           
          <img src={thumbnail} alt={`Episode ${number}`} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1a1f2b] to-[#232a3a]">
            <IconFilm2 className="scale-75 text-[#39415a]" />
          </div>
        )}
        {!unreleased && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            <IconPlay size={16} />
          </span>
        )}
        {/* Exact duration badge rendered over the thumbnail — from API `duration` field */}
        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-px text-[9.5px] font-semibold text-white/90">
          {fmtDuration(durationMin)}
        </span>
        {progressPct !== undefined && progressPct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
            <div className="h-full bg-[#ff7a1a]" style={{ width: `${Math.min(100, progressPct)}%` }} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-white/90">
          <span className="text-[#ff7a1a]">EP {number}</span>
          {title ? ` · ${title}` : ''}
        </p>
        <p className="mt-0.5 text-[11px] text-white/40">
          {unreleased
            ? `Airs ${new Date(airingAt! * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
            : `${fmtDuration(durationMin)} · Subbed`}
        </p>
      </div>
      {!unreleased && (
        <span className="mr-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition group-hover:bg-[#ff7a1a] group-hover:text-black">
          <IconPlay size={13} />
        </span>
      )}
    </button>
  );
}

export function CardSkeleton() {
  return (
    <div className="w-full">
      <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-[#171b24]" />
      <div className="mt-2 h-3.5 w-4/5 animate-pulse rounded bg-[#171b24]" />
      <div className="mt-1.5 h-3 w-2/5 animate-pulse rounded bg-[#14171f]" />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/50">
      <IconLoader size={30} className="aj-spin text-[#ff7a1a]" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
