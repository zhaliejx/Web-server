'use client';

// ── Settings — sources, theme and credits in one modal ──────────────────────
// • Sources: every stream provider can be toggled off; preferences persist in
//   localStorage and disabled tiers are never contacted (faster resolving).
// • Theme: recolors the entire app via the --aj-acc variable.
// • Credits: the public data & playback sources Ajest aggregates.

import { useEffect, useRef } from 'react';
import { PROVIDER_ORDER, PROVIDERS, MANGA_SOURCE_ORDER, MANGA_SOURCES, DRAMA_SOURCE_ORDER, DRAMA_SOURCES, useSourcePrefs, useMangaSourcePrefs, useDramaSourcePrefs } from '@/lib/ajest/prefs';
import { THEMES, useTheme } from '@/lib/ajest/themes';
import { IconClose, IconCheck } from './icons';

const CREDITS: { name: string; role: string }[] = [
  { name: 'AniList', role: 'Catalog, titles & artwork' },
  { name: 'Kitsu', role: 'Mirror catalog & fallback data' },
  { name: 'ani.zip', role: 'Episode metadata & ID mappings' },
  { name: 'ani.pm', role: 'HD embed playback (sub & dub)' },
  { name: 'Gogoanime', role: 'Direct stream sources' },
  { name: 'AnimeKaizen', role: 'Latest-episode mirror' },
  { name: 'YouTube', role: 'Official channel uploads' },
  { name: 'Dramacool', role: 'Drama catalog, direct HLS & hoster mirrors' },
  { name: 'MyAsianTV', role: 'Independent drama episode mirror' },
  { name: 'Rakuten Viki', role: 'Official drama matches (links out — DRM-protected)' },
  { name: 'YouTube dramas', role: 'Full episodes from Viki Global TV, KBS World, iQiyi' },
  { name: 'MangaFire', role: 'Embedded manga reader (iframe)' },
  { name: 'MangaDex', role: 'Manga catalog & reader' },
  { name: 'MangaRead', role: 'Manga mirror & chapter fallback' },
  { name: 'MangaPill', role: 'Manga mirror & chapter fallback' },
  { name: 'hls.js', role: 'Adaptive stream playback' },
];

export function SourceSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { disabled, toggle, reset } = useSourcePrefs();
  const mangaPrefs = useMangaSourcePrefs();
  const dramaPrefs = useDramaSourcePrefs();
  const { theme, setTheme } = useTheme();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Esc closes; click outside closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Defer the outside-click binding one tick so the opening click can't close it
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        ref={wrapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ajest settings"
        className="max-h-[86vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#12151d] shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[0.07] bg-[#12151d] px-5 pb-4 pt-5">
          <div>
            <h2 className="text-[15px] font-bold tracking-wide text-white">Settings</h2>
            <p className="mt-0.5 text-[11.5px] leading-snug text-white/45">
              Sources, appearance and the projects that make Ajest possible.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/[0.12] hover:text-white"
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* ── Theme ── */}
        <section className="border-b border-white/[0.05] px-5 py-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">Theme</h3>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {THEMES.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id || 'ember'}
                  onClick={() => setTheme(t.id)}
                  aria-pressed={active}
                  title={t.name}
                  className={`group flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 transition ${
                    active ? 'bg-white/[0.07] ring-1 ring-white/20' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <span
                    className="relative flex h-8 w-8 items-center justify-center rounded-full shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${t.acc}, color-mix(in srgb, ${t.acc} 62%, #000))` }}
                  >
                    {active && <IconCheck size={13} className="text-white drop-shadow" strokeWidth={3} />}
                  </span>
                  <span className={`text-[10.5px] font-semibold ${active ? 'text-white' : 'text-white/45'}`}>
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Sources ── */}
        <section className="px-2 py-2">
          <h3 className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
            Streaming sources
          </h3>
          <p className="px-3 pb-2 text-[11.5px] leading-snug text-white/45">
            Chain: Ani.pm → Gogoanime → AnimeKaizen → YouTube. Only the
            primary Ani.pm tier is on by default — backup mirrors stay off to
            keep data usage tiny. Turn them on anytime; AnimeKaizen and YouTube
            cost nothing extra, while Gogoanime's direct streams relay video
            through the server.
          </p>
          <ul className="flex flex-col divide-y divide-white/[0.05]">
            {PROVIDER_ORDER.map((id) => {
              const meta = PROVIDERS[id];
              const on = !disabled.includes(id);
              return (
                <li key={id}>
                  <button
                    onClick={() => toggle(id)}
                    role="switch"
                    aria-checked={on}
                    className="flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.035]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-bold ${on ? 'text-white' : 'text-white/35'}`}>
                          {meta.label}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            meta.kind === 'native'
                              ? 'bg-[var(--aj-acc-15)] text-[var(--aj-acc-hi)]'
                              : 'bg-white/[0.07] text-white/45'
                          }`}
                        >
                          {meta.badge}
                        </span>
                      </div>
                      <p className={`mt-1 text-[11.5px] leading-snug ${on ? 'text-white/50' : 'text-white/25'}`}>
                        {meta.blurb}
                      </p>
                    </div>
                    {/* Switch */}
                    <span
                      className={`relative w-10 shrink-0 rounded-full transition-colors duration-200 ${
                        on ? 'bg-[var(--aj-acc)]' : 'bg-white/[0.14]'
                      }`}
                      style={{ height: 22 }}
                    >
                      <span
                        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                          on ? 'left-[22px]' : 'left-[3px]'
                        }`}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between px-3 pb-2 pt-2.5">
            <span className="text-[10.5px] text-white/35">
              {PROVIDER_ORDER.length - disabled.length} of {PROVIDER_ORDER.length} sources enabled
            </span>
            {disabled.length > 0 && (
              <button
                onClick={reset}
                className="text-[11.5px] font-semibold text-[var(--aj-acc-hi)] transition hover:text-white"
              >
                Reset all
              </button>
            )}
          </div>
        </section>

        {/* ── Drama sources ── */}
        <section className="px-2 py-2">
          <h3 className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
            Drama sources
          </h3>
          <p className="px-3 pb-2 text-[11.5px] leading-snug text-white/45">
            Chain: Dramacool mirrors → MyAsianTV → YouTube official →
            Dramacool direct, with a Rakuten Viki chip when a title is
            verifiably on Viki. Mirror players render inside Ajest with their
            own controls and cost the server nothing, so they stay on. The
            direct HLS tier relays video through Ajest's server — it stays off
            by default to keep data usage tiny.
          </p>
          <ul className="flex flex-col divide-y divide-white/[0.05]">
            {DRAMA_SOURCE_ORDER.map((id) => {
              const meta = DRAMA_SOURCES[id];
              const on = !dramaPrefs.disabled.includes(id);
              return (
                <li key={id}>
                  <button
                    onClick={() => dramaPrefs.toggle(id)}
                    role="switch"
                    aria-checked={on}
                    className="flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.035]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-bold ${on ? 'text-white' : 'text-white/35'}`}>
                          {meta.label}
                        </span>
                        <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/45">
                          {meta.badge}
                        </span>
                      </div>
                      <p className={`mt-1 text-[11.5px] leading-snug ${on ? 'text-white/50' : 'text-white/25'}`}>
                        {meta.blurb}
                      </p>
                    </div>
                    <span
                      className={`relative w-10 shrink-0 rounded-full transition-colors duration-200 ${
                        on ? 'bg-[var(--aj-acc)]' : 'bg-white/[0.14]'
                      }`}
                      style={{ height: 22 }}
                    >
                      <span
                        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                          on ? 'left-[22px]' : 'left-[3px]'
                        }`}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between px-3 pb-2 pt-2.5">
            <span className="text-[10.5px] text-white/35">
              {DRAMA_SOURCE_ORDER.length - dramaPrefs.disabled.length} of {DRAMA_SOURCE_ORDER.length} sources enabled
            </span>
            {dramaPrefs.disabled.filter((d) => d !== 'dc-hls').length > 0 && (
              <button
                onClick={dramaPrefs.reset}
                className="text-[11.5px] font-semibold text-[var(--aj-acc-hi)] transition hover:text-white"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        {/* ── Manga sources ── */}
        <section className="px-2 py-2">
          <h3 className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
            Manga sources
          </h3>
          <p className="px-3 pb-2 text-[11.5px] leading-snug text-white/45">
            Chain: MangaFire (embedded reader) → MangaPill → MangaRead →
            MangaDex. Search merges every enabled source, and when MangaDex has
            no readable chapters (licensed titles) Ajest fills the list from
            the mirrors automatically — unless you turn them off here.
          </p>
          <ul className="flex flex-col divide-y divide-white/[0.05]">
            {MANGA_SOURCE_ORDER.map((id) => {
              const meta = MANGA_SOURCES[id];
              const on = !mangaPrefs.disabled.includes(id);
              return (
                <li key={id}>
                  <button
                    onClick={() => mangaPrefs.toggle(id)}
                    role="switch"
                    aria-checked={on}
                    className="flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.035]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-bold ${on ? 'text-white' : 'text-white/35'}`}>
                          {meta.label}
                        </span>
                        <span className="rounded-full bg-[var(--aj-acc-15)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--aj-acc-hi)]">
                          {meta.badge}
                        </span>
                      </div>
                      <p className={`mt-1 text-[11.5px] leading-snug ${on ? 'text-white/50' : 'text-white/25'}`}>
                        {meta.blurb}
                      </p>
                    </div>
                    <span
                      className={`relative w-10 shrink-0 rounded-full transition-colors duration-200 ${
                        on ? 'bg-[var(--aj-acc)]' : 'bg-white/[0.14]'
                      }`}
                      style={{ height: 22 }}
                    >
                      <span
                        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                          on ? 'left-[22px]' : 'left-[3px]'
                        }`}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between px-3 pb-2 pt-2.5">
            <span className="text-[10.5px] text-white/35">
              {MANGA_SOURCE_ORDER.length - mangaPrefs.disabled.length} of {MANGA_SOURCE_ORDER.length} sources enabled
            </span>
            {mangaPrefs.disabled.length > 0 && (
              <button
                onClick={mangaPrefs.reset}
                className="text-[11.5px] font-semibold text-[var(--aj-acc-hi)] transition hover:text-white"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        {/* ── Credits ── */}
        <section className="border-t border-white/[0.05] px-5 py-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
            Credits &amp; data sources
          </h3>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {CREDITS.map((c) => (
              <li key={c.name} className="flex items-baseline gap-1.5 text-[11.5px] leading-snug">
                <span className="font-bold text-white/75">{c.name}</span>
                <span className="text-white/35">{c.role}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10.5px] leading-relaxed text-white/30">
            Ajest is a non-commercial fan project. It hosts no video — all playback is served
            by the third-party providers credited above, and all metadata belongs to its
            respective owners.
          </p>
        </section>
      </div>
    </div>
  );
}
