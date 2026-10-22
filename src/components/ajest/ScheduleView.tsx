'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AnimeCard as AnimeCardType } from '@/lib/ajest/types';
import { fetchSchedule, fmtCountdown, fmtTime } from '@/lib/ajest/client';
import { IconSatellite, IconLoader, IconAlert, IconRefresh, IconClock } from './icons';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function CountdownChip({ airingAt, now }: { airingAt: number; now: number }) {
  const { text, live } = fmtCountdown(airingAt, now);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] font-bold tabular-nums ${
        live
          ? 'bg-[#4ade80]/15 text-[#4ade80]'
          : airingAt * 1000 - now < 3600_000
            ? 'bg-[var(--aj-acc-15)] text-[var(--aj-acc-hi)]'
            : 'bg-white/[0.07] text-white/70'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-[#4ade80] aj-live-dot' : 'bg-[var(--aj-acc)]'}`} />
      {live ? 'Airing now' : `T-${text}`}
    </span>
  );
}

export function ScheduleView({ onOpen }: { onOpen: (a: AnimeCardType) => void }) {
  const [items, setItems] = useState<AnimeCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dayFilter, setDayFilter] = useState<number>(new Date().getDay());

  const load = () => {
    setLoading(true);
    setError(null);
    fetchSchedule()
      .then((d) => {
        if (d.ok) setItems(d.items);
        else setError(d.error || 'Could not load the simulcast feed');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Network error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Group by weekday (local timezone)
  const byDay = useMemo(() => {
    const groups: Record<number, AnimeCardType[]> = {};
    for (const it of items) {
      if (!it.airingAt) continue;
      const d = new Date(it.airingAt * 1000);
      const day = d.getDay();
      (groups[day] ||= []).push(it);
    }
    Object.values(groups).forEach((arr) => arr.sort((a, b) => (a.airingAt || 0) - (b.airingAt || 0)));
    return groups;
  }, [items]);

  const today = new Date().getDay();
  const week = Array.from({ length: 7 }, (_, i) => (today + i) % 7); // Sun..Sat starting today
  const shown = byDay[dayFilter] || [];
  const upcoming = shown.filter((s) => (s.airingAt || 0) * 1000 > now).length;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-8">
      {/* Header */}
      <div className="aj-rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-[var(--aj-acc)]"><IconSatellite size={22} /></span>
            <h1 className="text-2xl font-extrabold tracking-tight text-white md:text-3xl">Simulcast Schedule</h1>
          </div>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-white/50">
            Live weekly airing timeline synced to real-world release clocks — countdowns tick to the exact
            minute in your local timezone. Powered by AniList airing schedules, Kitsu + gogoanime.by as fallback.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-4 py-2 text-[12.5px] font-semibold text-white/80 transition hover:bg-white/[0.13]"
        >
          <IconRefresh size={14} /> Refresh feed
        </button>
      </div>

      {/* Day tabs */}
      <div className="aj-rise no-scrollbar mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Weekday filter">
        {week.map((d, i) => {
          const count = (byDay[d] || []).length;
          const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_LABELS[d];
          const active = dayFilter === d;
          return (
            <button
              key={i}
              role="tab"
              aria-selected={active}
              onClick={() => setDayFilter(d)}
              className={`flex min-w-[86px] flex-col items-center rounded-2xl border px-4 py-2.5 transition ${
                active
                  ? 'border-[var(--aj-acc-60)] bg-[var(--aj-acc-10)] text-white'
                  : 'border-white/[0.07] bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/85'
              }`}
            >
              <span className="text-[13px] font-bold">{label}</span>
              <span className={`mt-0.5 text-[10.5px] ${active ? 'text-[var(--aj-acc-hi)]' : 'text-white/35'}`}>
                {count} airing
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-white/50">
          <IconLoader size={34} className="aj-spin text-[var(--aj-acc)]" />
          <p className="text-sm">Syncing weekly airing timeline…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#14171f] py-16 text-white/55">
          <IconAlert size={26} className="text-[#ff6b70]" />
          <p className="text-sm">{error}</p>
          <button onClick={load} className="rounded-full bg-[var(--aj-acc)] px-5 py-2 text-[12.5px] font-bold text-black">
            Retry
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-[#14171f] py-16 text-white/50">
          <IconClock size={24} />
          <p className="text-sm">No episodes scheduled for this day.</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-white/40">
            {shown.length} episodes · {upcoming} upcoming — all times {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((s) => {
              const released = (s.airingAt || 0) * 1000 <= now;
              return (
                <button
                  key={`${s.id}-${s.episodeNo}`}
                  onClick={() => onOpen(s)}
                  className={`aj-card-hover group flex gap-3.5 rounded-2xl border p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aj-acc)] ${
                    released
                      ? 'border-white/[0.07] bg-[#14171f]'
                      : 'border-[var(--aj-acc-20)] bg-gradient-to-br from-[#171b24] to-[#1a1520]'
                  }`}
                >
                  <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl bg-[#1c212c] ring-1 ring-white/[0.07]">
                    {s.cover && (
                       
                      <img src={s.cover} alt={s.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-bold leading-snug text-white/90 group-hover:text-[var(--aj-acc-hi)]">
                      {s.title}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-white/45">
                      <span className="font-semibold text-white/70">
                        {s.episodeNo ? `EP ${s.episodeNo}` : 'New episode'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <IconClock size={10} />
                        {s.airingAt ? fmtTime(s.airingAt) : '—'}
                      </span>
                      {s.duration ? <span>{s.duration} min</span> : null}
                    </div>
                    <div className="mt-2">
                      {s.airingAt ? (
                        <CountdownChip airingAt={s.airingAt} now={now} />
                      ) : (
                        <span className="rounded-md bg-white/[0.07] px-2 py-1 text-[11px] text-white/55">Weekly</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
