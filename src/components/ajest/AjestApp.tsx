'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnimeCard as AnimeCardType } from '@/lib/ajest/types';
import { fetchCatalog } from '@/lib/ajest/client';
import { HeroCarousel } from './HeroCarousel';
import { Row, ContinueRow } from './Row';
import { DetailView } from './DetailView';
import Player from './Player';
import { ScheduleView } from './ScheduleView';
import { LibraryView } from './LibraryView';
import { SearchView } from './SearchView';
import { AppControls } from './AppControls';
import {
  AjestMark,
  IconHome,
  IconSearch,
  IconCalendar,
  IconClock,
  IconHeart,
  IconBookmark,
  IconFlame,
  IconSparkle,
  IconGlobe,
  IconFilm,
  IconLoader,
} from './icons';
import { useHistory, useLiked, useWatchLater } from '@/lib/ajest/store';
import { fetchDetail } from '@/lib/ajest/client';

type View =
  | { kind: 'home' }
  | { kind: 'search' }
  | { kind: 'schedule' }
  | { kind: 'history' }
  | { kind: 'liked' }
  | { kind: 'later' }
  | { kind: 'detail'; anime: AnimeCardType };

interface PlayIntent {
  anime: AnimeCardType;
  episode: number;
}

// ── AjestApp — main shell ────────────────────────────────────────────────────
// Rendered client-only via dynamic(ssr:false), so localStorage is safe.

export default function AjestApp() {
  const [view, setView] = useState<View>({ kind: 'home' });
  const [catalog, setCatalog] = useState<Record<string, AnimeCardType[]>>({});
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [playIntent, setPlayIntent] = useState<PlayIntent | null>(null);
  const [detailEpisodes, setDetailEpisodes] = useState<{ number: number; title?: string }[]>([]);
  const [query, setQuery] = useState('');

  const upsertHistory = useHistory((s) => s.upsert);
  const historyEntries = useHistory((s) => s.entries);

  // Load home catalog immediately — no bootup screen, content right away
  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then((d) => {
        if (cancelled) return;
        setCatalog(d.sections || {});
        setCatalogError(d.ok === false ? 'Catalog feed unavailable' : null);
      })
      .catch(() => !cancelled && setCatalogError('Could not reach the catalog feed'))
      .finally(() => !cancelled && setCatalogLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Track scroll for topbar shadow
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Register the PWA service worker (installable web app + offline shell)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const t = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  const openAnime = useCallback((a: AnimeCardType) => {
    setView({ kind: 'detail', anime: a });
    window.scrollTo({ top: 0 });
  }, []);

  const goHome = useCallback(() => {
    setView({ kind: 'home' });
    window.scrollTo({ top: 0 });
  }, []);

  const nav = useCallback((v: View['kind']) => {
    setView({ kind: v } as View);
    window.scrollTo({ top: 0 });
  }, []);

  // Play: resolve episode list for next-episode support, then launch player
  const play = useCallback(
    async (anime: AnimeCardType, episode?: number) => {
      const ep = episode || historyEntries[anime.id]?.episode.number || 1;
      setPlayIntent({ anime, episode: ep });
      // Fetch episodes lazily for next-episode navigation (non-blocking for playback)
      fetchDetail(anime.id, anime.title)
        .then((d) => {
          if (d.ok) setDetailEpisodes(d.episodes.map((e) => ({ number: e.number, title: e.title })));
        })
        .catch(() => undefined);
    },
    [historyEntries]
  );

  const saveProgress = useCallback(
    (progress: number, durationSec: number) => {
      if (!playIntent) return;
      upsertHistory({
        anime: playIntent.anime,
        episode: {
          number: playIntent.episode,
          title: detailEpisodes.find((e) => e.number === playIntent.episode)?.title,
        },
        progress,
        durationSec,
        updatedAt: Date.now(),
      });
    },
    [playIntent, upsertHistory, detailEpisodes]
  );

  const heroItems = useMemo(() => catalog.trending || [], [catalog]);

  const NAV: { key: View['kind']; label: string; icon: React.ReactNode }[] = [
    { key: 'home', label: 'Home', icon: <IconHome size={21} /> },
    { key: 'search', label: 'Search', icon: <IconSearch size={21} /> },
    { key: 'schedule', label: 'Simulcast', icon: <IconCalendar size={21} /> },
    { key: 'history', label: 'History', icon: <IconClock size={21} /> },
    { key: 'liked', label: 'Liked', icon: <IconHeart size={21} /> },
    { key: 'later', label: 'Watch Later', icon: <IconBookmark size={21} /> },
  ];

  const activeKey = view.kind === 'detail' ? null : view.kind;

  return (
    <div className="aj-fade-in flex min-h-screen flex-col bg-[#0b0d12]">
      {/* ── Desktop sidebar ── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[74px] flex-col items-center border-r border-white/[0.06] bg-[#0d1016]/90 py-5 backdrop-blur md:flex">
        <button onClick={goHome} className="mb-7 transition-transform hover:scale-110" aria-label="Ajest home">
          <AjestMark size={38} />
        </button>
        <nav className="flex flex-1 flex-col gap-1.5" aria-label="Primary">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => nav(n.key)}
              aria-current={activeKey === n.key ? 'page' : undefined}
              className={`group relative flex h-12 w-12 items-center justify-center rounded-2xl transition-all ${
                activeKey === n.key
                  ? 'bg-[var(--aj-acc-15)] text-[var(--aj-acc)]'
                  : 'text-white/45 hover:bg-white/[0.06] hover:text-white/85'
              }`}
            >
              {activeKey === n.key && (
                <span className="absolute -left-[14px] h-6 w-[3px] rounded-full bg-[var(--aj-acc)]" />
              )}
              {n.icon}
              <span className="pointer-events-none absolute left-[52px] z-50 whitespace-nowrap rounded-lg bg-[#1c212c] px-2.5 py-1.5 text-[11.5px] font-semibold text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                {n.label}
              </span>
              {n.key === 'history' && Object.keys(historyEntries).length > 0 && (
                <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--aj-acc)]" />
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2 text-white/25">
          <IconFilm size={18} />
          <span className="text-[8px] font-bold tracking-[0.2em]">AJEST</span>
        </div>
      </aside>

      {/* ── Top bar ── */}
      <header
        className={`sticky top-0 z-30 transition-all ${
          scrolled ? 'border-b border-white/[0.06] bg-[#0b0d12]/88 shadow-lg backdrop-blur-xl' : 'bg-transparent'
        } md:pl-[74px]`}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:px-8">
          <button onClick={goHome} className="flex items-center gap-2 md:hidden" aria-label="Ajest home">
            <AjestMark size={26} />
            <span className="text-[15px] font-extrabold tracking-[0.18em] text-white">AJEST</span>
          </button>
          <span className="hidden items-center gap-1.5 text-[13px] font-bold tracking-[0.22em] text-white/85 md:flex">
            <IconSparkle size={14} className="text-[var(--aj-acc)]" /> ANIME, UNBOUND
          </span>
          <div className="flex-1" />
          <button
            onClick={() => nav('search')}
            className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[12.5px] text-white/45 transition hover:border-[var(--aj-acc-40)] hover:text-white/75"
            aria-label="Search anime"
          >
            <IconSearch size={14} />
            <span className="hidden sm:inline">Search anime…</span>
          </button>
          <button
            onClick={() => nav('schedule')}
            className="hidden items-center gap-1.5 rounded-full bg-[var(--aj-acc-12)] px-4 py-2 text-[12px] font-bold text-[var(--aj-acc-hi)] ring-1 ring-[var(--aj-acc-25)] transition hover:bg-[var(--aj-acc-25)] sm:flex"
          >
            <IconGlobe size={13} /> Simulcast
          </button>
          <AppControls />
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 md:pl-[74px]">
        {view.kind === 'home' && (
          <>
            <HeroCarousel items={heroItems} onOpen={openAnime} onPlay={(a) => play(a, 1)} />
            <div className="relative z-10 -mt-6 space-y-9 md:space-y-11 pb-24 pt-4">
              <ContinueRow onOpen={openAnime} />
              {catalogLoading && !heroItems.length ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/50">
                  <IconLoader size={32} className="aj-spin text-[var(--aj-acc)]" />
                  <p className="text-sm">Curating your catalog…</p>
                </div>
              ) : catalogError && !heroItems.length ? (
                <div className="mx-4 flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#14171f] py-16 text-white/55 md:mx-8">
                  <IconFlame size={26} className="text-[#ff6b70]" />
                  <p className="text-sm">{catalogError}</p>
                  <button onClick={() => window.location.reload()} className="rounded-full bg-[var(--aj-acc)] px-5 py-2 text-[12.5px] font-bold text-black">
                    Reload
                  </button>
                </div>
              ) : (
                <>
                  <Row title="Trending Now" items={catalog.trending || []} onOpen={openAnime} icon={<IconFlame size={19} />} />
                  <Row title="Popular This Season" items={catalog.seasonal || []} onOpen={openAnime} icon={<IconSparkle size={19} />} />
                  <Row title="Top Rated of All Time" items={catalog.topRated || []} onOpen={openAnime} badge="TOP" />
                  <Row title="Action Spotlight" items={catalog.action || []} onOpen={openAnime} />
                  <Row title="Fantasy Realms" items={catalog.fantasy || []} onOpen={openAnime} />
                  <Row title="Romance & Drama" items={catalog.romance || []} onOpen={openAnime} />
                  <Row title="Upcoming Next Season" items={catalog.upcoming || []} onOpen={openAnime} badge="SOON" />
                </>
              )}
            </div>
          </>
        )}

        {view.kind === 'search' && <SearchView initialQuery={query} onOpen={openAnime} />}
        {view.kind === 'schedule' && <ScheduleView onOpen={openAnime} />}
        {view.kind === 'history' && <LibraryView kind="history" onOpen={openAnime} onPlay={(a) => play(a)} />}
        {view.kind === 'liked' && <LibraryView kind="liked" onOpen={openAnime} onPlay={(a) => play(a, 1)} />}
        {view.kind === 'later' && <LibraryView kind="later" onOpen={openAnime} onPlay={(a) => play(a, 1)} />}

        {view.kind === 'detail' && (
          <DetailView
            anime={view.anime}
            onBack={goHome}
            onPlay={(a, ep) => play(a, ep)}
            onOpen={openAnime}
          />
        )}
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-white/[0.08] bg-[#0d1016]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label="Mobile navigation"
      >
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => nav(n.key)}
            aria-current={activeKey === n.key ? 'page' : undefined}
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[9.5px] font-semibold transition-colors ${
              activeKey === n.key ? 'text-[var(--aj-acc)]' : 'text-white/45'
            }`}
          >
            {n.icon}
            {n.label}
          </button>
        ))}
      </nav>

      {/* ── Player overlay ── */}
      {playIntent && (
        <Player
          anime={playIntent.anime}
          episode={playIntent.episode}
          episodeTitle={detailEpisodes.find((e) => e.number === playIntent.episode)?.title}
          resumeAt={
            historyEntries[playIntent.anime.id]?.episode.number === playIntent.episode
              ? historyEntries[playIntent.anime.id]?.progress
              : undefined
          }
          hasNext={detailEpisodes.some((e) => e.number === playIntent.episode + 1)}
          onClose={() => setPlayIntent(null)}
          onNextEpisode={() => {
            if (playIntent) setPlayIntent({ ...playIntent, episode: playIntent.episode + 1 });
          }}
          onProgress={saveProgress}
        />
      )}
    </div>
  );
}
