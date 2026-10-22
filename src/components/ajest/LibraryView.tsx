'use client';

import { useMemo, useState } from 'react';
import type { AnimeCard as AnimeCardType } from '@/lib/ajest/types';
import { AnimeCard } from './AnimeCard';
import { IconHeart, IconBookmark, IconClock, IconTrash, IconPlay, IconInfo } from './icons';
import { useHistory, historySorted, useLiked, useWatchLater } from '@/lib/ajest/store';
import { fmtProgress } from '@/lib/ajest/client';

type LibraryKind = 'history' | 'liked' | 'later';

const CONFIG: Record<LibraryKind, { title: string; blurb: string; icon: React.ReactNode; empty: string }> = {
  history: {
    title: 'History',
    blurb: 'Everything you have watched on Ajest, sorted by most recently played, with resume progress saved to this device.',
    icon: <IconClock size={22} />,
    empty: 'Nothing watched yet — press Play on any episode and it will appear here with a progress bar.',
  },
  liked: {
    title: 'Liked',
    blurb: 'Series you have favorited with the heart toggle. Your personal hall of fame.',
    icon: <IconHeart size={22} />,
    empty: 'No favorites yet — tap the heart on any info page to build your collection.',
  },
  later: {
    title: 'Watch Later',
    blurb: 'Your bookmark queue — series queued up for the next binge session.',
    icon: <IconBookmark size={22} />,
    empty: 'Your queue is empty — bookmark series with the bookmark toggle on any info page.',
  },
};

export function LibraryView({
  kind,
  onOpen,
  onPlay,
}: {
  kind: LibraryKind;
  onOpen: (a: AnimeCardType) => void;
  onPlay: (a: AnimeCardType) => void;
}) {
  const cfg = CONFIG[kind];
  const historyEntries = useHistory((s) => s.entries);
  const removeHistory = useHistory((s) => s.remove);
  const likedItems = useLiked((s) => s.items);
  const laterItems = useWatchLater((s) => s.items);

  const [removing, setRemoving] = useState<string | null>(null);

  const entries = useMemo(() => historySorted(historyEntries), [historyEntries]);
  const count = kind === 'history' ? entries.length : kind === 'liked' ? likedItems.length : laterItems.length;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-8">
      <div className="aj-rise mb-8">
        <div className="flex items-center gap-2.5 text-[var(--aj-acc)]">
          {cfg.icon}
          <h1 className="text-2xl font-extrabold tracking-tight text-white md:text-3xl">{cfg.title}</h1>
          <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[11px] font-bold text-white/60">{count}</span>
        </div>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-white/50">{cfg.blurb}</p>
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/10 bg-[#10131a] py-20 text-white/45">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.05] text-white/30">{cfg.icon}</span>
          <p className="max-w-sm text-center text-[13px]">{cfg.empty}</p>
        </div>
      ) : kind === 'history' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((e) => {
            const pct = e.durationSec > 0 ? Math.min(100, (e.progress / e.durationSec) * 100) : e.progress > 0 ? Math.min(90, 25 + (e.progress / 60) * 1.5) : 0;
            return (
              <div
                key={e.anime.id}
                className="aj-rise group flex gap-4 rounded-2xl border border-white/[0.07] bg-[#14171f] p-3 transition-colors hover:border-white/[0.14]"
              >
                <button
                  onClick={() => onOpen(e.anime)}
                  className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-[#1c212c] ring-1 ring-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aj-acc)]"
                  aria-label={`Open ${e.anime.title}`}
                >
                  {e.anime.cover && (
                     
                    <img src={e.anime.cover} alt={e.anime.title} loading="lazy" className="h-full w-full object-cover" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <button onClick={() => onOpen(e.anime)} className="block w-full text-left">
                    <p className="truncate text-[13.5px] font-bold text-white/90 hover:text-[var(--aj-acc-hi)]">{e.anime.title}</p>
                  </button>
                  <p className="mt-0.5 text-[11.5px] text-white/45">
                    EP {e.episode.number}
                    {e.episode.title ? ` · ${e.episode.title}` : ''}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/35">{fmtProgress(e.progress)}</p>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[var(--aj-acc)]" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10.5px] text-white/35">
                    <span>{pct >= 95 ? 'Finished' : `${Math.round(pct)}% watched`}</span>
                    <span>{new Date(e.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      onClick={() => onPlay(e.anime)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--aj-acc)] px-3.5 py-1.5 text-[11.5px] font-bold text-black transition hover:bg-[var(--aj-acc-hi2)]"
                    >
                      <IconPlay size={11} /> Resume
                    </button>
                    <button
                      onClick={() => {
                        setRemoving(e.anime.id);
                        setTimeout(() => {
                          removeHistory(e.anime.id);
                          setRemoving(null);
                        }, 180);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
                        removing === e.anime.id
                          ? 'bg-[#e5484d] text-white'
                          : 'bg-white/[0.06] text-white/55 hover:bg-[#e5484d]/20 hover:text-[#ff6b70]'
                      }`}
                      aria-label={`Remove ${e.anime.title} from history`}
                    >
                      <IconTrash size={11} /> {removing === e.anime.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-3.5 gap-y-6 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7">
          {(kind === 'liked' ? likedItems : laterItems).map((a) => (
            <div key={a.id} className="aj-rise">
              <AnimeCard anime={a} onOpen={onOpen} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
