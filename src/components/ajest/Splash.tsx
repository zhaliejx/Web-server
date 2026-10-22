'use client';

import { useEffect, useRef, useState } from 'react';
import { AjestMark, IconCheck, IconClose, IconLoader } from './icons';
import { fetchHealth } from '@/lib/ajest/client';

// ── Cinematic startup sequence ───────────────────────────────────────────────
// 1. Pure-SVG logo draw-on animation (stroke dash + fill + glow)
// 2. Loading bar tracks real API verification (AniList / Kitsu / ani.zip / gogoanime.by)
// 3. Seamless fade-out into the home dashboard once connections are verified

const MIN_SPLASH_MS = 2400;

export default function Splash({ onDone }: { onDone: (healthy: boolean) => void }) {
  const [phase, setPhase] = useState<'boot' | 'verify' | 'ready' | 'exit'>('boot');
  const [progress, setProgress] = useState(8);
  const [statusLine, setStatusLine] = useState('Igniting the Ajest core');
  const [services, setServices] = useState<Record<string, boolean | null>>({
    anilist: null,
    kitsu: null,
    anizip: null,
    gogo: null,
    relay: null,
  });
  const [overall, setOverall] = useState<boolean | null>(null);
  const healthyRef = useRef(false);
  const doneRef = useRef(false);

  // Progress ticker — eases toward the target
  useEffect(() => {
    const t = setInterval(() => {
      setProgress((p) => {
        const target = phase === 'ready' ? 100 : phase === 'verify' ? 78 : 34;
        const next = p + (target - p) * 0.12;
        return Math.min(next, target);
      });
    }, 90);
    return () => clearInterval(t);
  }, [phase]);

  // API verification
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const t0 = setTimeout(() => !cancelled && setPhase('verify'), 900);
      try {
        const h = await fetchHealth();
        if (cancelled) return;
        healthyRef.current = h.ok;
        setOverall(h.ok);
        setServices({
          anilist: h.services.anilist,
          kitsu: h.services.kitsu,
          anizip: h.services.anizip,
          gogo: h.services.gogo,
          relay: h.services.relay,
        });
      } catch {
        if (!cancelled) {
          healthyRef.current = false;
          setOverall(false);
          setServices({ anilist: false, kitsu: false, anizip: false, gogo: false, relay: false });
        }
      }
      clearTimeout(t0);
      if (cancelled) return;
      setPhase('ready');
      setStatusLine(healthyRef.current ? 'Connection verified' : 'Offline mode — cached catalog');
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Status line choreography + exit
  useEffect(() => {
    const lines = ['Connecting to AniList tier', 'Syncing Kitsu mirror', 'Loading ani.zip episode maps', 'Probing gogoanime stream sources'];
    let i = 0;
    const cycle = setInterval(() => {
      if (phase !== 'ready') {
        setStatusLine(lines[i % lines.length]);
        i++;
      }
    }, 1100);

    const exitTimer = setTimeout(
      () => {
        setPhase((cur) => (cur === 'ready' || cur === 'verify' ? 'exit' : cur));
        setTimeout(() => {
          if (!doneRef.current) {
            doneRef.current = true;
            onDone(healthyRef.current);
          }
        }, 750);
      },
      MIN_SPLASH_MS + 900
    );

    return () => {
      clearInterval(cycle);
      clearTimeout(exitTimer);
    };
  }, [phase, onDone]);

  // AniList has recurring global outages — when it's down but mirrors are
  // serving, show it as degraded (amber) instead of a hard failure (red X).
  const degraded = overall === true && services.anilist === false;
  const rows: { key: string; label: string }[] = [
    { key: 'anilist', label: degraded ? 'AniList · outage — Kitsu mirrors serving' : 'AniList · primary catalog' },
    { key: 'kitsu', label: 'Kitsu · mirror catalog' },
    { key: 'anizip', label: 'ani.zip · episode metadata' },
    { key: 'gogo', label: 'Gogoanime · stream sources' },
    { key: 'relay', label: 'Relay · search assist' },
  ];

  return (
    <div
      className={`aj-splash ${phase === 'exit' ? 'aj-splash-exit' : ''}`}
      role="status"
      aria-label="Ajest is starting up"
    >
      {/* Ambient backdrop glows (pure CSS/SVG) */}
      <div className="aj-splash-glow aj-splash-glow-1" />
      <div className="aj-splash-glow aj-splash-glow-2" />

      <div className="aj-splash-core">
        <AjestMark size={104} animated className="aj-splash-logo" />

        {/* Wordmark */}
        <div className="aj-splash-word" aria-hidden="true">
          {'AJEST'.split('').map((ch, i) => (
            <span key={i} className="aj-splash-letter" style={{ animationDelay: `${0.9 + i * 0.09}s` }}>
              {ch}
            </span>
          ))}
        </div>
        <p className="aj-splash-tagline">Anime, unbound.</p>

        {/* Loading bar */}
        <div className="aj-splash-bar" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className="aj-splash-bar-fill" style={{ width: `${progress}%` }} />
        </div>

        <p className="aj-splash-status" key={statusLine}>
          {statusLine}
          <span className="aj-splash-dots" />
        </p>

        {/* Service verification rows */}
        <ul className="aj-splash-services">
          {rows.map((r) => (
            <li key={r.key}>
              <span className="aj-splash-svc-label">{r.label}</span>
              <span
                className={`aj-splash-svc-state ${
                  services[r.key] === false
                    ? overall
                      ? 'is-degraded'
                      : 'is-fail'
                    : services[r.key]
                      ? 'is-ok'
                      : 'is-wait'
                }`}
                title={services[r.key] === false && overall ? 'Down — mirrors are serving this tier' : undefined}
              >
                {services[r.key] === null ? (
                  <IconLoader size={13} className="aj-spin" />
                ) : services[r.key] ? (
                  <IconCheck size={13} strokeWidth={2.6} />
                ) : (
                  <IconClose size={12} strokeWidth={2.6} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="aj-splash-foot">Ajest · triple-tier data fabric v1.0</p>
    </div>
  );
}
