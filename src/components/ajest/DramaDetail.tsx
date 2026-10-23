'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DramaDetail, DramaItem } from '@/lib/ajest/types';
import { fetchDramaDetail } from '@/lib/ajest/client';
import { useDramaHistory } from '@/lib/ajest/dramastore';
import { IconAlert, IconChevronLeft, IconClock, IconLoader, IconPlay, IconStar } from './icons';

interface Props {
  drama: DramaItem;
  onBack: () => void;
  onPlay: (d: DramaItem, ep: number) => void;
}

/** Series detail — cover/header, metadata, and a full episode grid. */
export function DramaDetail({ drama, onBack, onPlay }: Props) {
  const [detail, setDetail] = useState<(DramaDetail & { ok: boolean; error?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const historyEntry = useDramaHistory((s) => s.entries[drama.slug]);

  useEffect(() => {
    let cancelled = false;
    // Deferred reset (same pattern as Player) — avoids sync setState in effect
    const t = setTimeout(() => {
      if (cancelled) return;
      setDetail(null);
      setError(null);
      fetchDramaDetail(drama.slug)
        .then((d) => {
          if (cancelled) return;
          if (d.ok) setDetail(d);
          else setError(d.error || 'Could not load this series');
        })
        .catch(() => !cancelled && setError('Could not reach the drama source'));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [drama.slug]);

  const episodes = detail?.episodes || [];
  // Resume target: the saved episode if it still exists, else episode 1
  const resumeEp = useMemo(() => {
    if (historyEntry && episodes.some((e) => e.number === historyEntry.episode.number)) return historyEntry.episode.number;
    return episodes.length ? episodes[0].number : 1;
  }, [historyEntry, episodes]);

  return (
    <div className="relative pb-24">
      {/* ── Backdrop ── */}
      <div className="relative h-[38vw] max-h-[420px] min-h-[220px] w-full overflow-hidden">
        {drama.cover ? (
          <img src={drama.cover} alt="" className="h-full w-full scale-110 object-cover opacity-25 blur-sm" draggable={false} />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#141824] to-[#0b0d12]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d12] via-[#0b0d12]/55 to-transparent" />
        <button
          onClick={onBack}
          className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white/85 backdrop-blur transition hover:bg-black/80 md:left-8"
          aria-label="Back"
        >
          <IconChevronLeft size={19} />
        </button>
      </div>

      <div className="mx-auto -mt-28 max-w-7xl px-4 md:-mt-36 md:px-8">
        {/* ── Header ── */}
        <div className="flex flex-col gap-5 md:flex-row md:gap-7">
          <img
            src={drama.cover}
            alt={drama.title}
            className="h-[240px] w-[160px] shrink-0 rounded-2xl border border-white/10 object-cover shadow-2xl md:h-[330px] md:w-[220px]"
            draggable={false}
          />
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-white md:text-4xl">{drama.title}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-white/55">
              {detail?.drama.year && <span className="font-semibold text-white/75">{detail.drama.year}</span>}
              {detail?.drama.country && <span>{detail.drama.country}</span>}
              {detail?.drama.status && (
                <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[11px] font-bold text-white/70">{detail.drama.status}</span>
              )}
              {detail?.network && <span>· {detail.network}</span>}
              {detail?.runtime && (
                <span className="inline-flex items-center gap-1">
                  <IconClock size={12} /> {detail.runtime}
                </span>
              )}
              {detail?.drama.type && <span>· {detail.drama.type}</span>}
            </div>

            {/* Resume / play */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onPlay(drama, resumeEp)}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--aj-acc)] px-6 py-2.5 text-[13px] font-bold text-black shadow transition hover:brightness-110"
              >
                <IconPlay size={15} />
                {historyEntry ? `EP ${resumeEp} · Resume` : 'Episode 1'}
              </button>
              {detail?.drama.year && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-white/45">
                  <IconStar size={13} /> {episodes.length} episode{episodes.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {/* Genres */}
            {!!detail?.genres?.length && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {detail.genres.slice(0, 10).map((g) => (
                  <span key={g} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            {detail?.description && (
              <p className="mt-4 max-w-3xl text-[13.5px] leading-relaxed text-white/65">{detail.description}</p>
            )}
            {!!detail?.casts?.length && (
              <p className="mt-3 max-w-3xl text-[12px] text-white/45">
                <span className="font-bold text-white/60">Cast: </span>
                {detail.casts.join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* ── Episodes ── */}
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-white/90">Episodes</h2>
          {error ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#14171f] py-14 text-white/55">
              <IconAlert size={24} className="text-[#ff6b70]" />
              <p className="text-sm">{error}</p>
            </div>
          ) : !detail ? (
            <div className="flex flex-col items-center gap-3 py-16 text-white/50">
              <IconLoader size={30} className="aj-spin text-[var(--aj-acc)]" />
              <p className="text-sm">Unpacking series…</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10 md:gap-2.5">
              {episodes.map((e) => {
                const watched = historyEntry?.episode.number === e.number;
                return (
                  <button
                    key={e.epKey}
                    onClick={() => onPlay(drama, e.number)}
                    title={e.title || `Episode ${e.number}`}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2.5 text-[12px] font-bold transition ${
                      watched
                        ? 'border-[var(--aj-acc-40)] bg-[var(--aj-acc-15)] text-[var(--aj-acc-hi)]'
                        : 'border-white/[0.07] bg-white/[0.04] text-white/70 hover:border-[var(--aj-acc-40)] hover:bg-[var(--aj-acc-12)] hover:text-white'
                    }`}
                  >
                    <span>{Number.isInteger(e.number) ? e.number : e.number.toFixed(1)}</span>
                    {e.durationMin ? <span className="text-[9px] font-medium text-white/35">{e.durationMin}m</span> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
