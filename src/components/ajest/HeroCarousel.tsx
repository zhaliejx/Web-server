'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnimeCard as AnimeCardType } from '@/lib/ajest/types';
import {
  IconPlay,
  IconInfo,
  IconBookmark,
  IconHeart,
  IconStar,
  IconClock,
  IconChevronLeft,
  IconChevronRight,
} from './icons';
import { useLiked, useWatchLater } from '@/lib/ajest/store';
import { cleanDescription, fmtDuration } from '@/lib/ajest/client';

const SLIDE_MS = 9000;

export function HeroCarousel({
  items,
  onOpen,
  onPlay,
}: {
  items: AnimeCardType[];
  onOpen: (a: AnimeCardType) => void;
  onPlay: (a: AnimeCardType) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fading, setFading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const slides = items.slice(0, 7);
  const current = slides[idx];

  const goTo = useCallback(
    (next: number) => {
      setFading(true);
      setTimeout(() => {
        setIdx(next);
        setFading(false);
      }, 320);
    },
    []
  );

  useEffect(() => {
    if (paused || slides.length < 2) return;
    timer.current = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIdx((i) => (i + 1) % slides.length);
        setFading(false);
      }, 320);
    }, SLIDE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, slides.length]);

  const liked = useLiked((s) => (current ? s.items.some((x) => x.id === current.id) : false));
  const later = useWatchLater((s) => (current ? s.items.some((x) => x.id === current.id) : false));
  const toggleLiked = useLiked((s) => s.toggle);
  const toggleLater = useWatchLater((s) => s.toggle);

  if (!current) {
    return (
      <div className="relative h-[62vh] min-h-[420px] w-full animate-pulse bg-[#10131a]">
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0b0d12] to-transparent" />
      </div>
    );
  }

  return (
    <section
      className="relative h-[68vh] min-h-[480px] w-full overflow-hidden"
      aria-label="Trending anime spotlight"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Backdrop */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${fading ? 'opacity-40' : 'opacity-100'}`}>
        {current.banner || current.cover ? (
           
          <img
            key={current.id}
            src={current.banner || current.cover}
            alt=""
            className="aj-kenburns h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#1a1f2b] to-[#0f1219]" />
        )}
      </div>

      {/* Cinematic gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d12] via-[#0b0d12]/35 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0d12]/95 via-[#0b0d12]/45 to-transparent" />

      {/* Content */}
      <div className={`absolute bottom-0 left-0 right-0 px-4 pb-14 md:px-8 md:pb-20 transition-opacity duration-300 ${fading ? 'opacity-0 translate-y-2' : 'opacity-100'}`}>
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[#ff7a1a] px-2 py-1 text-[10.5px] font-extrabold uppercase tracking-wider text-black">
              <IconFlame3 /> #{idx + 1} Trending Now
            </span>
            {current.score ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/10 backdrop-blur px-2 py-1 text-[11px] font-semibold text-[#ffc46b]">
                <IconStar size={11} filled /> {(current.score / 10).toFixed(1)}
              </span>
            ) : null}
            {current.duration ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/10 backdrop-blur px-2 py-1 text-[11px] font-semibold text-white/85">
                <IconClock size={11} /> {fmtDuration(current.duration)} / ep
              </span>
            ) : null}
            {current.format ? (
              <span className="rounded-md bg-white/10 backdrop-blur px-2 py-1 text-[11px] font-semibold text-white/85">
                {current.format.replace('_', ' ')}
              </span>
            ) : null}
          </div>

          <h1 className="text-3xl md:text-5xl font-extrabold leading-[1.08] tracking-tight text-white drop-shadow-2xl">
            {current.titleEnglish || current.title}
          </h1>

          <p className="mt-3 hidden sm:block max-w-xl text-sm md:text-[15px] leading-relaxed text-white/70 line-clamp-3 drop-shadow">
            {cleanDescription(current.description).slice(0, 240)}
            {cleanDescription(current.description).length > 240 ? '…' : ''}
          </p>

          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => onPlay(current)}
              className="inline-flex items-center gap-2 rounded-full bg-[#ff7a1a] px-7 py-3 text-sm font-bold text-black transition hover:bg-[#ff8d3d] hover:scale-[1.03] active:scale-95 shadow-[0_8px_30px_rgba(255,122,26,0.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <IconPlay size={16} /> Play Free
            </button>
            <button
              onClick={() => onOpen(current)}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <IconInfo size={16} /> Details
            </button>
            <button
              onClick={() => toggleLiked(current)}
              aria-label={liked ? 'Remove from liked' : 'Add to liked'}
              className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur transition hover:scale-110 active:scale-95 ${
                liked ? 'bg-[#e5484d]/20 text-[#ff6b70]' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <IconHeart size={18} filled={liked} />
            </button>
            <button
              onClick={() => toggleLater(current)}
              aria-label={later ? 'Remove from Watch Later' : 'Add to Watch Later'}
              className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur transition hover:scale-110 active:scale-95 ${
                later ? 'bg-[#ff7a1a]/25 text-[#ffb37a]' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <IconBookmark size={18} filled={later} />
            </button>
          </div>
        </div>
      </div>

      {/* Arrows */}
      <button
        onClick={() => goTo((idx - 1 + slides.length) % slides.length)}
        className="absolute left-3 top-1/2 z-10 hidden md:flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/80 opacity-0 transition hover:bg-black/70 hover:text-white focus:opacity-100 group-hover:opacity-100"
        aria-label="Previous trending anime"
      >
        <IconChevronLeft size={20} />
      </button>
      <button
        onClick={() => goTo((idx + 1) % slides.length)}
        className="absolute right-3 top-1/2 z-10 hidden md:flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/80 transition hover:bg-black/70 hover:text-white"
        aria-label="Next trending anime"
      >
        <IconChevronRight size={20} />
      </button>

      {/* Dot indicators with progress fill */}
      <div className="absolute bottom-5 right-5 z-10 hidden md:flex items-center gap-2">
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === idx ? 'w-8 bg-[#ff7a1a]' : 'w-3 bg-white/30 hover:bg-white/50'
            }`}
          >
            {i === idx && !paused && <span className="block h-full w-full rounded-full" />}
          </button>
        ))}
      </div>
    </section>
  );
}

function IconFlame3() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 22c4.4 0 7.5-2.9 7.5-7 0-3-1.8-5.2-3.4-7C14.6 6.3 13.5 4.6 13.5 2c-3 1.8-4.6 4.4-4.7 6.8-.9-.6-1.6-1.5-2-2.6C5.2 8 4.5 10.3 4.5 12.6 4.5 19.1 7.6 22 12 22z" />
    </svg>
  );
}
