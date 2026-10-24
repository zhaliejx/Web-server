'use client';

// ── Netflix Exclusives — bundled catalog, tap-to-play ───────────────────────
// A curated index of Netflix originals & exclusive Asian dramas (see
// netflix-catalog.ts). Cards resolve lazily against the live dramacool search
// as they scroll into view (staggered queue, one request at a time), and the
// resolved slug/cover cache in localStorage so the next visit is instant.
// Playback itself rides the app's usual drama chain — nothing touches
// Netflix, no account, no DRM. Honest and free, like everything here.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DramaItem } from '@/lib/ajest/types';
import { NETFLIX_EXCLUSIVES, type NetflixSeed } from '@/lib/ajest/netflix-catalog';
import { resolveNetflixTitle } from '@/lib/ajest/client';
import { IconLoader, IconSearch, IconClose, IconFlame } from './icons';

const CACHE_KEY = 'aj.netflix.resolve.v2';
const FAIL_TTL = 3 * 24 * 3600_000; // retry "no match" after 3 days
const STAGGER_MS = 280; // one upstream search at a time, gently

type ResHit = { slug: string; title: string; cover: string; year?: string; status?: string; country?: string };
type ResFail = { failed: 1; at: number };
type ResEntry = ResHit | ResFail;

function isUsableHit(e: ResEntry | undefined): e is ResHit {
  return !!e && !('failed' in e);
}
function isLiveFail(e: ResEntry | undefined): boolean {
  return !!e && 'failed' in e && Date.now() - e.at < FAIL_TTL;
}

function loadCache(): Record<string, ResEntry> {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ResEntry>) : {};
  } catch {
    return {};
  }
}
function saveCache(map: Record<string, ResEntry>) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable */
  }
}

const COUNTRY_CHIPS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'K-Drama', value: 'South Korea' },
  { label: 'C-Drama', value: 'China' },
  { label: 'J-Drama', value: 'Japan' },
  { label: 'Lakorn', value: 'Thailand' },
  { label: 'Taiwan', value: 'Taiwan' },
];

// ── Card ─────────────────────────────────────────────────────────────────────

function NetflixCatalogCard({
  seed,
  entry,
  resolving,
  onActivate,
}: {
  seed: NetflixSeed;
  entry: ResEntry | undefined;
  resolving: boolean;
  onActivate: () => void;
}) {
  const hit = isUsableHit(entry);
  const dead = isLiveFail(entry);
  return (
    <button
      onClick={onActivate}
      className={`group relative w-full overflow-hidden rounded-xl text-left ring-1 transition ${
        dead ? 'opacity-40 ring-white/[0.04]' : 'ring-white/[0.07] hover:ring-[#e50914]/50'
      }`}
      aria-label={seed.title}
    >
      <div className="relative aspect-[2/3] w-full">
        {hit ? (
          <img
            src={hit.cover}
            alt={seed.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a1013] via-[#14171f] to-[#0f1218] p-2.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] bg-gradient-to-b from-[#e50914] to-[#7d0009] text-[11px] font-black leading-none text-white shadow-sm">
              N
            </span>
            <p className="mt-2 line-clamp-3 text-[11.5px] font-bold leading-snug text-white/80">{seed.title}</p>
            <p className="mt-1 text-[10px] font-semibold text-white/35">
              {seed.year} · {seed.country}
            </p>
            {resolving && (
              <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 text-[10px] font-bold text-white/50">
                <IconLoader size={12} className="aj-spin text-[#e50914]" /> Finding…
              </span>
            )}
            {dead && (
              <span className="absolute bottom-2.5 left-2.5 text-[10px] font-bold text-white/40">Not found</span>
            )}
          </div>
        )}
        {/* NETFLIX chip */}
        <span
          className={`absolute right-1.5 top-1.5 rounded-[5px] px-1.5 py-0.5 text-[9px] font-black tracking-wide ${
            seed.original ? 'bg-[#e50914] text-white' : 'bg-black/75 text-[#ff6b70] ring-1 ring-[#e50914]/60'
          }`}
        >
          {seed.original ? 'N ORIGINAL' : 'N EXCLUSIVE'}
        </span>
      </div>
      <div className="px-1.5 pb-2 pt-1.5">
        <p className="truncate text-[11.5px] font-bold text-white/90">{seed.title}</p>
        <p className="text-[10px] font-semibold text-white/35">
          {seed.year} · {seed.country}
        </p>
      </div>
    </button>
  );
}

// ── View ─────────────────────────────────────────────────────────────────────

interface Props {
  onOpen: (d: DramaItem) => void;
}

export function NetflixCatalogView({ onOpen }: Props) {
  const [country, setCountry] = useState('');
  const [q, setQ] = useState('');
  const [originalsOnly, setOriginalsOnly] = useState(false);
  const [sortAZ, setSortAZ] = useState(false);
  // Client-only component (parent mounts via dynamic ssr:false) — the lazy
  // initializer reads localStorage directly, no effect/state dance needed.
  const [resolutions, setResolutions] = useState<Record<string, ResEntry>>(() =>
    typeof window === 'undefined' ? {} : loadCache()
  );
  const [resolving, setResolving] = useState<Record<string, true>>({});

  // ── Lazy resolve pipeline ──────────────────────────────────────────────────
  const ioRef = useRef<IntersectionObserver | null>(null);
  const queuedRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(new Set());
  const resolutionsRef = useRef(resolutions);
  const [queueTick, setQueueTick] = useState(0);
  const drainingRef = useRef(false);

  // Keep the mirror fresh BEFORE the drain effect reads it (declared first,
  // so it runs first on every commit).
  useEffect(() => {
    resolutionsRef.current = resolutions;
  }, [resolutions]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        let added = false;
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const t = (en.target as HTMLElement).dataset.nfTitle;
          if (t && !queuedRef.current.has(t)) {
            queuedRef.current.add(t);
            added = true;
          }
        }
        if (added) setQueueTick((x) => x + 1);
      },
      { rootMargin: '320px' }
    );
    ioRef.current = io;
    // Ref callbacks for the first paint run BEFORE this effect, so those
    // cards saw a null observer — sweep them up here.
    document.querySelectorAll('[data-nf-title]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const enqueueVisible = useCallback((el: HTMLElement | null) => {
    if (!el || !ioRef.current) return;
    ioRef.current.observe(el);
  }, []);

  // Drain: one search at a time, short gap, skip anything already answered.
  useEffect(() => {
    if (drainingRef.current) return;
    const cache = resolutionsRef.current;
    const next = [...queuedRef.current].find(
      (t) => !isUsableHit(cache[t]) && !isLiveFail(cache[t]) && !inFlightRef.current.has(t)
    );
    if (!next) return;
    drainingRef.current = true;
    inFlightRef.current.add(next);
    const seed = NETFLIX_EXCLUSIVES.find((s) => s.title === next);
    const t = setTimeout(() => {
      setResolving((r) => ({ ...r, [next]: true }));
      resolveNetflixTitle(next, seed?.year)
        .then((res) => {
          setResolutions((prev) => {
            const upd = { ...prev };
            if (res.ok && res.item) {
              upd[next] = {
                slug: res.item.slug,
                title: res.item.title,
                cover: res.item.cover,
                year: res.item.year,
                status: res.item.status,
                country: res.item.country,
              };
            } else {
              upd[next] = { failed: 1, at: Date.now() };
            }
            saveCache(upd);
            return upd;
          });
        })
        .catch(() => {
          /* network flap — leave unqueued-free so it can retry on next visit */
        })
        .finally(() => {
          setResolving((r) => {
            const c = { ...r };
            delete c[next];
            return c;
          });
          queuedRef.current.delete(next);
          inFlightRef.current.delete(next);
          drainingRef.current = false;
          setTimeout(() => setQueueTick((x) => x + 1), STAGGER_MS);
        });
    }, 120);
    return () => {
      clearTimeout(t);
      drainingRef.current = false;
    };
  }, [queueTick, resolutions]);
  // NOTE: re-run on `resolutions` too — after each answer we want the next
  // drain immediately (the finally-scheduled tick also covers the gap).

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const seeds = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = NETFLIX_EXCLUSIVES.filter(
      (s) =>
        (!country || s.country === country) &&
        (!originalsOnly || s.original === 1) &&
        (!needle || s.title.toLowerCase().includes(needle))
    );
    list = [...list].sort((a, b) => (sortAZ ? a.title.localeCompare(b.title) : b.year - a.year || a.title.localeCompare(b.title)));
    return list;
  }, [country, q, originalsOnly, sortAZ]);

  const resolvedCount = useMemo(
    () => seeds.reduce((n, s) => n + (isUsableHit(resolutions[s.title]) ? 1 : 0), 0),
    [seeds, resolutions]
  );

  // Direct tap on an unresolved card: resolve now, then open.
  const openWithResolve = (seed: NetflixSeed) => {
    const cachedEntry = resolutions[seed.title];
    if (isUsableHit(cachedEntry)) {
      onOpen({
        slug: cachedEntry.slug,
        title: cachedEntry.title,
        cover: cachedEntry.cover,
        year: cachedEntry.year,
        status: cachedEntry.status,
        country: cachedEntry.country,
        source: 'dramacool',
      });
      return;
    }
    if (isLiveFail(cachedEntry) || resolving[seed.title] || inFlightRef.current.has(seed.title)) return;
    inFlightRef.current.add(seed.title);
    setResolving((r) => ({ ...r, [seed.title]: true }));
    resolveNetflixTitle(seed.title, seed.year)
      .then((res) => {
        let resolved: ResHit | null = null;
        setResolutions((prev) => {
          const upd = { ...prev };
          if (res.ok && res.item) {
            upd[seed.title] = {
              slug: res.item.slug,
              title: res.item.title,
              cover: res.item.cover,
              year: res.item.year,
              status: res.item.status,
              country: res.item.country,
            };
            resolved = upd[seed.title] as ResHit;
          } else {
            upd[seed.title] = { failed: 1, at: Date.now() };
          }
          saveCache(upd);
          return upd;
        });
        // The user tapped this card to WATCH it — open the detail as soon as
        // the match lands (queue-resolved cards just fill in their cover).
        if (resolved) {
          onOpen({ ...resolved, source: 'dramacool' });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setResolving((r) => {
          const c = { ...r };
          delete c[seed.title];
          return c;
        });
        inFlightRef.current.delete(seed.title);
        queuedRef.current.delete(seed.title);
        setTimeout(() => setQueueTick((x) => x + 1), 0);
      });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-8">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-white">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] bg-gradient-to-b from-[#e50914] to-[#7d0009] text-[15px] font-black leading-none text-white shadow">
            N
          </span>
          Netflix Exclusives
        </h1>
        <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11.5px] font-semibold text-white/55">
          {seeds.length} titles{resolvedCount ? ` · ${resolvedCount} ready` : ''}
        </span>
      </div>
      <p className="mb-4 max-w-3xl text-[12px] leading-relaxed text-white/40">
        A curated index of Netflix originals and Netflix-exclusive Asian dramas. Tapping a title finds it on our
        drama sources — playback uses the app&apos;s regular chain, no Netflix account or DRM involved. Covers fill
        in as titles are matched (cached on device).
      </p>

      {/* Controls */}
      <div className="mb-4 space-y-2.5 rounded-2xl border border-white/[0.06] bg-[#11141c]/70 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[210px] flex-1 sm:max-w-xs">
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter titles…"
              className="w-full rounded-full border border-white/[0.09] bg-white/[0.04] py-2 pl-9 pr-8 text-[12.5px] font-semibold text-white placeholder:text-white/30 focus:border-[#e50914]/60 focus:outline-none"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white"
                aria-label="Clear filter"
              >
                <IconClose size={13} />
              </button>
            )}
          </div>
          {COUNTRY_CHIPS.map((c) => (
            <button
              key={c.value || 'all'}
              onClick={() => setCountry(c.value)}
              aria-pressed={country === c.value}
              className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
                country === c.value
                  ? 'bg-[var(--aj-acc)] text-black'
                  : 'border border-white/[0.09] bg-white/[0.04] text-white/60 hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
          <button
            onClick={() => setOriginalsOnly((v) => !v)}
            aria-pressed={originalsOnly}
            className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
              originalsOnly
                ? 'bg-[#e50914] text-white'
                : 'border border-white/[0.09] bg-white/[0.04] text-white/60 hover:text-white'
            }`}
          >
            N Originals only
          </button>
          <button
            onClick={() => setSortAZ((v) => !v)}
            className="rounded-full border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-white/60 transition hover:text-white"
          >
            {sortAZ ? 'A–Z' : 'Newest'}
          </button>
        </div>
      </div>

      {/* Grid */}
      {!seeds.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#14171f] py-16 text-white/55">
          <IconFlame size={26} className="text-[#ff6b70]" />
          <p className="text-sm">No titles match “{q}”.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
          {seeds.map((s) => (
            <div key={s.title} data-nf-title={s.title} ref={enqueueVisible}>
              <NetflixCatalogCard
                seed={s}
                entry={resolutions[s.title]}
                resolving={!!resolving[s.title]}
                onActivate={() => openWithResolve(s)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
