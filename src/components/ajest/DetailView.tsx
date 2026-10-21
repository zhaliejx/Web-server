'use client';

import { useEffect, useState } from 'react';
import type { AnimeCard as AnimeCardType, DetailPayload, HistoryEntry } from '@/lib/ajest/types';
import {
  IconHeart,
  IconBookmark,
  IconStar,
  IconPlay,
  IconClock,
  IconCalendar,
  IconFilm,
  IconInfo,
  IconLoader,
  IconClose,
  IconChevronLeft,
  TierBadge,
} from './icons';
import { EpisodeItem, Spinner } from './AnimeCard';
import { fetchDetail, cleanDescription, fmtDuration } from '@/lib/ajest/client';
import { useLiked, useWatchLater, useHistory } from '@/lib/ajest/store';

interface Props {
  anime: AnimeCardType;
  onBack: () => void;
  onPlay: (anime: AnimeCardType, episode: number) => void;
  onOpen: (a: AnimeCardType) => void;
}

const TZ = 'local';

export function DetailView({ anime, onBack, onPlay, onOpen }: Props) {
  const [data, setData] = useState<(DetailPayload & { ok: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetchDetail(anime.id, anime.title)
      .then((d) => {
        if (cancelled) return;
        if (d.ok) setData(d);
        else setError(d.error || 'Could not load details');
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Network error'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [anime.id, anime.title]);

  const merged: AnimeCardType = data?.anime
    ? { ...data.anime, banner: data.anime.banner || anime.banner, cover: data.anime.cover || anime.cover }
    : anime;

  const liked = useLiked((s) => s.items.some((x) => x.id === anime.id));
  const later = useWatchLater((s) => s.items.some((x) => x.id === anime.id));
  const toggleLiked = useLiked((s) => s.toggle);
  const toggleLater = useWatchLater((s) => s.toggle);
  const history = useHistory((s) => s.entries[anime.id]);
  const display = merged.titleEnglish || merged.title;

  return (
    <div className="min-h-screen bg-[#0b0d12] pb-24">
      {/* Backdrop banner */}
      <div className="relative h-[46vh] min-h-[340px] w-full overflow-hidden">
        {merged.banner || merged.cover ? (
           
          <img src={merged.banner || merged.cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#1a1f2b] to-[#0f1219]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d12] via-[#0b0d12]/45 to-[#0b0d12]/20" />
        <button
          onClick={onBack}
          className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-4 py-2 text-[13px] font-semibold text-white/90 backdrop-blur transition hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a1a]"
          aria-label="Go back"
        >
          <IconChevronLeft size={16} /> Back
        </button>
      </div>

      <div className="relative mx-auto -mt-36 max-w-6xl px-4 md:px-8">
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Poster */}
          <div className="w-40 shrink-0 md:w-52">
            <div className="aspect-[2/3] overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-2xl">
              {merged.cover ? (
                 
                <img src={merged.cover} alt={display} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-[#171b24]" />
              )}
            </div>
          </div>

          {/* Meta + actions */}
          <div className="min-w-0 flex-1 md:pt-24">
            <div className="mb-2 flex items-center gap-2">
              <TierBadge tier={merged.source || 'anilist'} />
              {merged.status === 'RELEASING' && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[#4ade80]/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-[#4ade80]">
                  <span className="aj-live-dot h-1.5 w-1.5 rounded-full bg-[#4ade80]" /> Airing now
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-white">{display}</h1>
            {merged.titleNative && <p className="mt-1 text-sm text-white/45">{merged.titleNative}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-white/65">
              {merged.score ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#ffc46b]">
                  <IconStar size={14} filled /> {(merged.score / 10).toFixed(1)}
                </span>
              ) : null}
              {merged.duration ? (
                <span className="inline-flex items-center gap-1.5">
                  <IconClock size={14} /> {fmtDuration(merged.duration)} / ep
                </span>
              ) : null}
              {merged.episodes ? (
                <span className="inline-flex items-center gap-1.5">
                  <IconFilm size={14} /> {merged.episodes} episodes
                </span>
              ) : null}
              {merged.format ? <span>{merged.format.replace('_', ' ')}</span> : null}
              {merged.season && merged.seasonYear ? (
                <span className="inline-flex items-center gap-1.5">
                  <IconCalendar size={14} /> {merged.season} {merged.seasonYear}
                </span>
              ) : null}
              {merged.studio ? <span className="text-white/45">{merged.studio}</span> : null}
            </div>

            {/* Genres */}
            {merged.genres && merged.genres.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {merged.genres.slice(0, 7).map((g) => (
                  <span key={g} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11.5px] font-medium text-white/70">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Library toggles — SVG heart + SVG bookmark */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onPlay(merged, history?.episode.number || 1)}
                className="inline-flex items-center gap-2 rounded-full bg-[#ff7a1a] px-6 py-2.5 text-[13.5px] font-bold text-black transition hover:bg-[#ff8d3d] hover:scale-[1.03] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <IconPlay size={15} /> {history ? `Resume EP ${history.episode.number}` : 'Start Watching'}
              </button>
              <button
                onClick={() => toggleLiked(merged)}
                aria-pressed={liked}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition hover:scale-[1.03] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  liked
                    ? 'bg-[#e5484d]/15 text-[#ff6b70] ring-1 ring-[#e5484d]/40'
                    : 'bg-white/[0.07] text-white/85 hover:bg-white/[0.13]'
                }`}
              >
                <IconHeart size={16} filled={liked} /> {liked ? 'Liked' : 'Like'}
              </button>
              <button
                onClick={() => toggleLater(merged)}
                aria-pressed={later}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition hover:scale-[1.03] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  later
                    ? 'bg-[#ff7a1a]/15 text-[#ffb37a] ring-1 ring-[#ff7a1a]/40'
                    : 'bg-white/[0.07] text-white/85 hover:bg-white/[0.13]'
                }`}
              >
                <IconBookmark size={16} filled={later} /> {later ? 'Saved' : 'Watch Later'}
              </button>
            </div>

            {/* Next episode countdown */}
            {merged.nextEpisodeAt && merged.nextEpisodeAt * 1000 > now && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#ff7a1a]/25 bg-[#ff7a1a]/[0.06] px-4 py-2 text-[13px] text-[#ffb37a]">
                <span className="aj-live-dot h-2 w-2 rounded-full bg-[#ff7a1a]" />
                Next episode in{' '}
                <Countdown target={merged.nextEpisodeAt} />
              </div>
            )}
          </div>
        </div>

        {/* Synopsis */}
        <div className="mt-8 max-w-3xl">
          <h2 className="mb-2 text-[15px] font-bold text-white/90">Synopsis</h2>
          <p className={`text-[13.5px] leading-relaxed text-white/60 ${expanded ? '' : 'line-clamp-4'}`}>
            {cleanDescription(merged.description)}
          </p>
          {cleanDescription(merged.description).length > 260 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-1.5 text-[12px] font-semibold text-[#ff7a1a] hover:underline"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>

        {/* Episodes */}
        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-white/95">Episodes</h2>
            {data?.episodes?.length ? (
              <span className="text-xs text-white/40">
                {data.episodes.length} episodes · durations from {merged.source === 'kitsu' ? 'Kitsu' : 'ani.zip + AniList'} metadata
              </span>
            ) : null}
          </div>

          {loading ? (
            <Spinner label="Fetching episode metadata…" />
          ) : error ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-[#14171f] py-12 text-white/50">
              <IconInfo size={22} />
              <p className="text-sm">{error}</p>
            </div>
          ) : data?.episodes?.length ? (
            <div className="grid max-h-[560px] gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {data.episodes.map((ep) => {
                const watched = history && history.episode.number === ep.number ? history : undefined;
                return (
                  <EpisodeItem
                    key={ep.number}
                    number={ep.number}
                    title={ep.title}
                    durationMin={ep.durationMin || merged.duration || 24}
                    thumbnail={ep.thumbnail}
                    airingAt={ep.airingAt ? new Date(ep.airingAt).getTime() / 1000 : undefined}
                    now={now / 1000}
                    progressPct={
                      watched && watched.durationSec > 0
                        ? (watched.progress / watched.durationSec) * 100
                        : undefined
                    }
                    onPlay={() => onPlay(merged, ep.number)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-[#14171f] py-12 text-white/50">
              <IconInfo size={22} />
              <p className="text-sm">Episode count not yet announced — check the Simulcast tab.</p>
            </div>
          )}
        </div>

        {/* Recommendations */}
        {data?.recommendations?.length ? (
          <div className="mt-12">
            <h2 className="mb-4 text-[17px] font-bold text-white/95">More like this</h2>
            <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 md:grid-cols-6">
              {data.recommendations.slice(0, 12).map((r) => (
                <button
                  key={r.id}
                  onClick={() => onOpen(r)}
                  className="aj-card-hover group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a1a] rounded-xl"
                  aria-label={`Open ${r.title}`}
                >
                  <div className="aspect-[2/3] overflow-hidden rounded-xl ring-1 ring-white/[0.07] bg-[#171b24]">
                    {r.cover && (
                       
                      <img src={r.cover} alt={r.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12px] font-medium text-white/75 group-hover:text-[#ffb37a]">{r.title}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target * 1000 - now);
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="font-mono font-bold tabular-nums">
      {d > 0 ? `${d}d ` : ''}{pad(h)}:{pad(m)}:{pad(sec)}
    </span>
  );
}
