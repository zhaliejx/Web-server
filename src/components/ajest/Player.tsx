'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { AnimeCard as AnimeCardType, StreamsPayload, VideoSource } from '@/lib/ajest/types';
import {
  IconPlay,
  IconPause,
  IconSkipBack,
  IconSkipForward,
  IconVolume,
  IconVolumeLow,
  IconVolumeMuted,
  IconFullscreen,
  IconFullscreenExit,
  IconClose,
  IconGear,
  IconLoader,
  IconAlert,
  IconRefresh,
  IconCheck,
} from './icons';
import { fetchStreams } from '@/lib/ajest/client';
import { useHistory } from '@/lib/ajest/store';

interface PlayerProps {
  anime: AnimeCardType;
  episode: number;
  episodeTitle?: string;
  resumeAt?: number;
  hasNext: boolean;
  onClose: () => void;
  onNextEpisode: () => void;
  onProgress: (progress: number, durationSec: number) => void;
}

function proxied(url: string): string {
  // The streams API already returns proxified URLs — never wrap twice
  // (a nested /api/proxy?u=/api/proxy?u=… makes the proxy fetch itself).
  if (url.startsWith('/api/proxy?u=')) return url;
  return `/api/proxy?u=${encodeURIComponent(url)}`;
}

// Embedded sources are identity-masked in the UI — never reveal the upstream brand
function providerLabel(p: string): string {
  if (p.startsWith('youtube')) return 'Official source';
  if (p === 'anipm') return 'HD player';
  if (p === 'kaizen') return 'Kaizen mirror';
  return p;
}

// ── ani.pm browser-side availability check ─────────────────────────────────
// ani.pm's Cloudflare blocks Node TLS fingerprints, so the server cannot
// verify episodes — but the partner API is CORS-open for browsers. The check
// runs in the USER'S browser (optimistic: iframe mounts immediately, only
// verified-missing episodes auto-switch provider).
const aniPmCache = new Map<number, { at: number; numbers?: Set<number> }>();
const ANIPM_EP_RE = /^https:\/\/ani\.pm\/embed\/ani\/(\d+)\/(\d+)\/(?:sub|dub)(?:[?#]|$)/;
async function aniPmEpisodeExists(anilistId: number, episode: number): Promise<boolean | null> {
  const hit = aniPmCache.get(anilistId);
  if (hit && Date.now() - hit.at < 600000) {
    return hit.numbers ? hit.numbers.has(episode) : null;
  }
  try {
    const r = await fetch(`https://ani.pm/api/partner/v1/series/${anilistId}`, { credentials: 'omit' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const list = d?.data?.episodeList;
    if (!Array.isArray(list) || !list.length) throw new Error('no episodeList');
    const numbers = new Set<number>();
    for (const e of list) if (typeof e?.number === 'number') numbers.add(e.number);
    aniPmCache.set(anilistId, { at: Date.now(), numbers });
    return numbers.has(episode);
  } catch {
    aniPmCache.set(anilistId, { at: Date.now() }); // fail marker — don't hammer
    return null;
  }
}

// ── Official IFrame Player API loader ──────────────────────────────────────
// The raw postMessage widget protocol no longer emits events from the current
// embed — the API script (same host as the embed itself) is the only reliable
// control channel. Loaded once, shared across player instances.
interface YTPlayerLike {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  setVolume(volume: number): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoLoadedFraction(): number;
  isMuted(): boolean;
  getPlayerState(): number;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}
let ytApiPromise: Promise<void> | null = null;
function loadYtApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as unknown as {
    YT?: { Player?: unknown };
    onYouTubeIframeAPIReady?: () => void;
  };
  if (w.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  });
  return ytApiPromise;
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

export default function Player({
  anime,
  episode,
  episodeTitle,
  resumeAt,
  hasNext,
  onClose,
  onNextEpisode,
  onProgress,
}: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourcesRef = useRef<VideoSource[]>([]);
  const srcIdxRef = useRef(0);
  const recoveredRef = useRef(false);
  const lastSaveRef = useRef(0);

  const [phase, setPhase] = useState<'resolving' | 'loading' | 'playing' | 'error'>('resolving');
  const [providers, setProviders] = useState<StreamsPayload['providersTried']>([]);
  const [activeProvider, setActiveProvider] = useState<string>('');
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [levels, setLevels] = useState<{ height: number; index: number }[]>([]);
  const [activeLevel, setActiveLevel] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seekHover, setSeekHover] = useState<number | null>(null);
  const [officialLinks, setOfficialLinks] = useState<{ site: string; url: string }[]>([]);
  const [ytEmbed, setYtEmbed] = useState<{ id: string; note?: string; provider: string } | null>(null);
  const [extEmbed, setExtEmbed] = useState<{ url: string; provider: string; note?: string } | null>(null);
  const extNextRef = useRef<(() => void) | null>(null);
  // Race guard for async embed validation — only act while THIS embed is live
  const activeEmbedUrlRef = useRef<string | null>(null);
  const [ytHint, setYtHint] = useState(false);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeAtRef = useRef(resumeAt);
  const ytWrapRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTPlayerLike | null>(null);
  const ytFailRef = useRef<(() => void) | null>(null);
  const ytHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytActiveRef = useRef(false);
  const ytInfo = useRef({ playing: false, muted: false, duration: 0, currentTime: 0, ready: false });
  const ytResumedRef = useRef(false);
  const ytWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest-ref mirrors — the player lifecycle effect must NOT re-run when the
  // parent re-renders (inline callbacks / history-store updates would otherwise
  // destroy and recreate the embedded player every few seconds).
  const onProgressRef = useRef(onProgress);
  const onNextRef = useRef(onNextEpisode);
  const hasNextRef = useRef(hasNext);
  useEffect(() => {
    onProgressRef.current = onProgress;
    onNextRef.current = onNextEpisode;
    hasNextRef.current = hasNext;
  });

  // Unified pause check across direct streams and embedded sources.
  // External embeds (vidlink/ani.pm/kaizen) have no <video> element — without
  // the ext-aware branch isPaused() always reports "paused" and the chrome
  // auto-hide timer never fires, leaving the title + source pills stuck on.
  const extActiveRef = useRef(false);
  useEffect(() => {
    extActiveRef.current = !!extEmbed;
  }, [extEmbed]);
  const isPaused = useCallback(
    () =>
      ytActiveRef.current
        ? !ytInfo.current.playing
        : extActiveRef.current
          ? false
          : (videoRef.current?.paused ?? true),
    []
  );

  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!isPaused()) setShowControls(false);
    }, 3200);
  }, [isPaused]);

  // ── Embedded-source control channel (official API — method calls, no postMessage) ──

  // Resume from saved History timestamp (skip back 4s, never re-seek past 95%)
  const applyResume = useCallback((v: HTMLVideoElement) => {
    const at = resumeAtRef.current;
    if (at && isFinite(v.duration) && v.duration > 0) {
      if (at < v.duration * 0.95 && at > 8) {
        v.currentTime = at - 4;
      }
      resumeAtRef.current = 0;
    }
  }, []);

  // Sync resume target when the episode changes mid-session
  useEffect(() => {
    resumeAtRef.current = resumeAt ?? 0;
  }, [resumeAt]);

  // ── Source attachment with automatic provider fallback ────────────────────
  // Self-recursion (fatal error → next provider) goes through a ref declared
  // before the implementation so the binding is always initialized.
  const attachRef = useRef<((index: number) => void) | null>(null);
  const attachSource = useCallback((index: number) => {
    const sources = sourcesRef.current;
    const video = videoRef.current;
    if (!video || index >= sources.length) {
      setPhase('error');
      return;
    }
    srcIdxRef.current = index;
    recoveredRef.current = false;
    const src = sources[index];
    setActiveProvider(src.provider);

    const nextSource = (reason: string) => {
      setFallbackNote(reason);
      if (index + 1 < sourcesRef.current.length) {
        attachRef.current?.(index + 1);
      } else {
        // Chain exhausted — unmount the embedded player so its audio stops too
        setYtEmbed(null);
        ytActiveRef.current = false;
        setExtEmbed(null);
        setPhase('error');
      }
    };

    // tear down previous
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    if (ytWatchdogRef.current) {
      clearTimeout(ytWatchdogRef.current);
      ytWatchdogRef.current = null;
    }
    if (ytHintTimerRef.current) {
      clearTimeout(ytHintTimerRef.current);
      ytHintTimerRef.current = null;
    }
    ytFailRef.current = null;

    // ── External embed (ani.pm / AnimeKaizen) — provider-rendered playback ──
    // Cross-origin player: Ajest cannot drive it, so its own controls handle
    // playback; Ajest keeps the top bar + a provider-switch chip.
    if (src.url.startsWith('embed:')) {
      const embedUrl = src.url.slice('embed:'.length);
      setYtEmbed(null);
      ytActiveRef.current = false;
      setExtEmbed({ url: embedUrl, provider: src.provider, note: src.note });
      activeEmbedUrlRef.current = embedUrl;
      extNextRef.current = () => nextSource(`${providerLabel(src.provider)} unavailable — switching provider…`);
      // ani.pm episodes: verify in-browser; auto-switch only on a confirmed miss
      if (src.provider === 'anipm') {
        const m = ANIPM_EP_RE.exec(embedUrl);
        if (m) {
          void aniPmEpisodeExists(Number(m[1]), Number(m[2])).then((exists) => {
            if (exists === false && activeEmbedUrlRef.current === embedUrl) {
              extNextRef.current?.();
            }
          });
        }
      }
      setCurrent(0);
      setDuration(0);
      setBuffered(0);
      setPlaying(true);
      setPhase('playing');
      // Arm the chrome auto-hide timer immediately — no mouse event will fire
      // over the player on its own, so without this the title + source pills
      // would stay visible forever (the exact "stuck pills" bug).
      bumpControls();
      onProgress(0, 0);
      return;
    }
    setExtEmbed(null);
    activeEmbedUrlRef.current = null;

    // ── Embedded official source — identity fully masked, Ajest-native controls ──
    if (src.url.startsWith('youtube:')) {
      setYtEmbed({ id: src.url.slice('youtube:'.length), note: src.note, provider: src.provider });
      ytActiveRef.current = true;
      ytInfo.current = { playing: false, muted: false, duration: 0, currentTime: 0, ready: false };
      ytResumedRef.current = false;
      setCurrent(0);
      setDuration(0);
      setBuffered(0);
      setPhase('loading');
      setYtHint(false);
      // If autoplay is blocked, guide the user after a short grace period
      ytHintTimerRef.current = setTimeout(() => setYtHint(true), 4500);
      // API-level failure (embed-disabled video, geo-block, dead id) → keep the chain moving
      ytFailRef.current = () => nextSource(`${providerLabel(src.provider)} unavailable — switching provider…`);
      // Record the episode in History before the first progress tick
      onProgress(0, 0);
      // Dead embed / blocked API script guard — last resort if no event ever fires
      ytWatchdogRef.current = setTimeout(() => {
        if (ytActiveRef.current && !ytInfo.current.ready) {
          nextSource(`${providerLabel(src.provider)} unavailable — switching provider…`);
        }
      }, 14000);
      return;
    }
    setYtEmbed(null);
    ytActiveRef.current = false;
    setYtHint(false);

    setPhase('loading');
    setLevels([]);
    setActiveLevel(-1);

    const url = proxied(src.url); // direct sources go through the proxy —
    // googlevideo URLs are signed to our server IP and need Range passthrough

    const armWatchdog = () => {
      watchdogRef.current = setTimeout(() => {
        if (videoRef.current && videoRef.current.readyState < 3) {
          nextSource(`${providerLabel(src.provider)} timed out — switching provider…`);
        }
      }, 16000);
    };

    const onFatal = () => {
      nextSource(`${providerLabel(src.provider)} stream failed — switching to next provider…`);
    };

    if (src.isM3U8 && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 40,
        maxMaxBufferLength: 90,
        fragLoadingTimeOut: 14000,
        manifestLoadingTimeOut: 12000,
        lowLatencyMode: false,
        enableWorker: true,
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        setLevels(
          data.levels
            .map((l, i) => ({ height: l.height || 0, index: i }))
            .filter((l) => l.height > 0)
            .sort((a, b) => b.height - a.height)
        );
        applyResume(video);
        video.play().catch(() => undefined);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setActiveLevel(data.level));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredRef.current) {
          recoveredRef.current = true;
          hls.recoverMediaError();
          return;
        }
        onFatal();
      });
      armWatchdog();
    } else {
      // Native playback (Safari HLS or mp4)
      video.src = url;
      const onCanPlay = () => {
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        applyResume(video);
        video.play().catch(() => undefined);
      };
      video.addEventListener('loadedmetadata', onCanPlay, { once: true });
      video.addEventListener('error', onFatal, { once: true });
      armWatchdog();
    }

  }, [onProgress, bumpControls]);

  // Register the attach implementation for recursive fallback calls
  useEffect(() => {
    attachRef.current = attachSource;
  }, [attachSource]);

  // ── Resolve stream chain (Provider 1 → 2 → 3) ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    // Defer resets so no state is written synchronously inside the effect body
    const t = setTimeout(() => {
      if (cancelled) return;
      setPhase('resolving');
      setFallbackNote(null);
      setProviders([]);
      fetchStreams(anime, episode)
        .then((payload) => {
          if (cancelled) return;
          setProviders(payload.providersTried || []);
          setOfficialLinks(payload.officialLinks || []);
          sourcesRef.current = payload.sources || [];
          if (payload.sources?.length) {
            attachSource(0);
          } else {
            setPhase('error');
          }
        })
        .catch(() => !cancelled && setPhase('error'));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [anime.id, episode]);

  // ── Embedded player lifecycle (official IFrame API — reliable events) ──────
  useEffect(() => {
    if (!ytEmbed) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    let player: YTPlayerLike | null = null;
    let lastPollT = 0; // last observed currentTime — used for progress-based reveal

    // 2 Hz truth-poll: duration/currentTime/mute/buffered + belt-and-braces reveal
    const ytTick = () => {
      const p = ytPlayerRef.current;
      if (!p) return;
      try {
        const dur = p.getDuration() || 0;
        const t = p.getCurrentTime() || 0;
        if (dur > 0) {
          ytInfo.current.duration = dur;
          ytInfo.current.ready = true;
          if (ytWatchdogRef.current) {
            clearTimeout(ytWatchdogRef.current);
            ytWatchdogRef.current = null;
          }
          setDuration(dur);
          // Resume from saved History timestamp (same policy as direct streams)
          if (!ytResumedRef.current) {
            ytResumedRef.current = true;
            const at = resumeAtRef.current;
            if (at && at > 8 && at < dur * 0.95) p.seekTo(at - 4, true);
            resumeAtRef.current = 0;
          }
        }
        ytInfo.current.currentTime = t;
        setCurrent(t);
        const nowTs = Date.now();
        if (nowTs - lastSaveRef.current > 5000 && t > 3) {
          lastSaveRef.current = nowTs;
          onProgressRef.current(t, ytInfo.current.duration);
        }
        if (dur > 0) setBuffered((p.getVideoLoadedFraction() || 0) * dur);
        const m = p.isMuted();
        ytInfo.current.muted = m;
        setMuted(m);
        // The state event alone is not trustworthy — some browsers never
        // deliver onStateChange and getPlayerState() can lag or throw while
        // the embed still autoplays. Any observed heartbeat reveals the video:
        // if audio plays, currentTime advances, so progress itself proves
        // playback. This fixes the "sound but no picture" regression.
        const st = (() => {
          try {
            return p.getPlayerState();
          } catch {
            return -99;
          }
        })();
        const prevT = lastPollT;
        lastPollT = t;
        const heartbeat = st === 1 || (dur > 0 && t > 0) || t > prevT + 0.2;
        if (heartbeat && !ytInfo.current.playing) {
          ytInfo.current.playing = true;
          setPlaying(true);
          setPhase('playing');
          bumpControls();
        }
      } catch {
        /* player not ready yet */
      }
    };

    loadYtApi().then(() => {
      if (cancelled || !ytWrapRef.current) return;
      // Host element is created outside React so the API can replace it freely
      const host = document.createElement('div');
      ytWrapRef.current.appendChild(host);
      const w = window as unknown as {
        YT: { Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayerLike };
      };
      player = new w.YT.Player(host, {
        videoId: ytEmbed.id,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          iv_load_policy: 3,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: { target: YTPlayerLike }) => {
            const ifr = e.target.getIframe();
            ifr.style.width = '100%';
            ifr.style.height = '100%';
            ifr.style.position = 'absolute';
            ifr.style.inset = '0';
            ytInfo.current.ready = true;
            if (ytWatchdogRef.current) {
              clearTimeout(ytWatchdogRef.current);
              ytWatchdogRef.current = null;
            }
            e.target.playVideo();
          },
          onStateChange: (e: { data: number }) => {
            const st = e?.data;
            if (typeof st !== 'number') return; // compat: ignore malformed events
            if (st === 1) {
              ytInfo.current.playing = true;
              setPlaying(true);
              setPhase('playing');
              bumpControls();
            } else if (st === 2) {
              ytInfo.current.playing = false;
              setPlaying(false);
              setShowControls(true);
              if (hideTimer.current) clearTimeout(hideTimer.current);
            } else if (st === 0) {
              ytInfo.current.playing = false;
              setPlaying(false);
              const d2 = ytInfo.current.duration;
              if (d2) onProgressRef.current(d2, d2);
              if (hasNextRef.current) onNextRef.current();
            }
          },
          onError: () => {
            // Embed-disabled / geo-blocked / dead video → fail over honestly
            ytFailRef.current?.();
          },
        },
      });
      ytPlayerRef.current = player;
      poll = setInterval(ytTick, 500);
    });

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
      ytPlayerRef.current = null;
      if (ytWrapRef.current) ytWrapRef.current.innerHTML = '';
    };
  }, [ytEmbed, bumpControls]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (ytWatchdogRef.current) clearTimeout(ytWatchdogRef.current);
      if (ytHintTimerRef.current) clearTimeout(ytHintTimerRef.current);
    };
  }, []);

  // ── Progress persistence (History) ────────────────────────────────────────
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    if (v.buffered.length) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }
    const nowTs = Date.now();
    if (nowTs - lastSaveRef.current > 5000 && v.currentTime > 3) {
      lastSaveRef.current = nowTs;
      onProgress(v.currentTime, v.duration || 0);
    }
  }, [onProgress]);

  const togglePlay = useCallback(() => {
    if (ytActiveRef.current) {
      const p = ytPlayerRef.current;
      if (p) {
        if (ytInfo.current.playing) p.pauseVideo();
        else p.playVideo();
      }
      bumpControls();
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  }, [bumpControls]);

  const seekBy = useCallback(
    (delta: number) => {
      if (ytActiveRef.current) {
        const p = ytPlayerRef.current;
        const dur = ytInfo.current.duration;
        const at = Math.min(Math.max(0, ytInfo.current.currentTime + delta), dur ? dur - 0.5 : Number.MAX_SAFE_INTEGER);
        if (p) p.seekTo(Math.max(0, at), true);
        bumpControls();
        return;
      }
      const v = videoRef.current;
      if (v && isFinite(v.duration)) {
        v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration - 0.5);
        bumpControls();
      }
    },
    [bumpControls]
  );

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      shellRef.current?.requestFullscreen().catch(() => undefined);
    } else {
      document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  // Fullscreen state sync
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') seekBy(10);
      else if (e.key === 'ArrowLeft') seekBy(-10);
      else if (e.key === 'f') toggleFullscreen();
      else if (e.key === 'm') {
        if (ytActiveRef.current) {
          const p = ytPlayerRef.current;
          if (p) {
            if (ytInfo.current.muted) p.unMute();
            else p.mute();
          }
        } else {
          const v = videoRef.current;
          if (v) {
            v.muted = !v.muted;
            setMuted(v.muted);
          }
        }
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        onClose();
      }
      bumpControls();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seekBy, toggleFullscreen, onClose, bumpControls]);

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (ytActiveRef.current) {
      const p = ytPlayerRef.current;
      const dur = ytInfo.current.duration;
      if (p && dur > 0) p.seekTo(pct * dur, true);
      return;
    }
    const v = videoRef.current;
    if (v && isFinite(v.duration)) v.currentTime = pct * v.duration;
  };

  const changeLevel = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setActiveLevel(index);
    }
    setSettingsOpen(false);
  };

  const changeSpeed = (s: number) => {
    if (ytActiveRef.current) {
      const p = ytPlayerRef.current;
      if (p) p.setPlaybackRate(s);
    } else if (videoRef.current) videoRef.current.playbackRate = s;
    setSpeed(s);
    setSettingsOpen(false);
  };

  const VolIcon = muted || volume === 0 ? IconVolumeMuted : volume < 0.5 ? IconVolumeLow : IconVolume;

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={shellRef}
      className="aj-player fixed inset-0 z-[80] select-none bg-black"
      onMouseMove={bumpControls}
      onClick={bumpControls}
      role="dialog"
      aria-label={`Ajest player — ${anime.title} episode ${episode}`}
    >
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full bg-black object-contain ${ytEmbed || extEmbed ? 'hidden' : ''}`}
        playsInline
        autoPlay
        onClick={togglePlay}
        onPlay={() => {
          setPlaying(true);
          setPhase('playing');
          bumpControls();
        }}
        onPause={() => {
          setPlaying(false);
          // Standard UX: keep controls visible while paused
          setShowControls(true);
          if (hideTimer.current) clearTimeout(hideTimer.current);
        }}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={(e) => setDuration((e.target as HTMLVideoElement).duration || 0)}
        onEnded={() => {
          const v = videoRef.current;
          if (v && isFinite(v.duration)) onProgress(v.duration, v.duration);
          if (hasNext) onNextEpisode();
        }}
        onVolumeChange={(e) => {
          const v = e.target as HTMLVideoElement;
          setVolume(v.volume);
          setMuted(v.muted);
        }}
      />

      {/* ── Embedded source — identity fully masked, native UI unreachable ── */}
      {ytEmbed && (
        <>
          {/* API-created player mounts here; wrapper gates visibility + pointer events */}
          <div
            className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
              phase === 'playing' ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div ref={ytWrapRef} className="h-full w-full" />
          </div>
          {/* Tap shield — every tap hits Ajest; the upstream player's own UI can never appear */}
          <div className="absolute inset-0 z-10 cursor-pointer" onClick={togglePlay} />
        </>
      )}

      {/* ── External embed (ani.pm / AnimeKaizen) — own controls, Ajest chrome ── */}
      {extEmbed && (
        <>
          <iframe
            src={extEmbed.url}
            className="absolute inset-0 z-0 h-full w-full border-0 bg-black"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="origin"
            title={`Ajest — ${providerLabel(extEmbed.provider)}`}
          />
          {/* ani.pm redirect shield — their player refuses sandboxed frames
              ("This player can't run in a sandboxed frame"), so there is no
              sandbox; without it, tapping the video surface top-navigates the
              page to their site. This shield covers everything EXCEPT the
              bottom 96px where their own pause/seek bar lives: the redirect
              layer never receives a click, their controls stay usable, and
              mousemove over the video wakes the Ajest chrome (cross-origin
              frames normally swallow it). */}
          {extEmbed.provider === 'anipm' && (
            <div
              className="absolute inset-x-0 top-0 z-10"
              style={{ bottom: 96 }}
              onMouseMove={bumpControls}
              onClick={bumpControls}
              aria-hidden="true"
            />
          )}
          {/* Wake strips — cross-origin iframes swallow mousemove, so these
              thin strips above the iframe re-summon the chrome on hover/tap
              while the middle of the screen stays fully interactive for the
              upstream player's own controls. ani.pm skips the bottom strip —
              that zone is its live control-bar passthrough instead. */}
          <div className="absolute inset-x-0 top-0 z-[5] h-14" onMouseMove={bumpControls} onClick={bumpControls} />
          {extEmbed.provider !== 'anipm' && (
            <div className="absolute inset-x-0 bottom-0 z-[5] h-14" onMouseMove={bumpControls} onClick={bumpControls} />
          )}
          <div
            className={`absolute bottom-5 right-4 z-30 flex items-center gap-2.5 rounded-full bg-black/70 px-3.5 py-1.5 text-[11.5px] font-semibold text-white/80 ring-1 ring-white/15 backdrop-blur transition-opacity duration-300 ${
              showControls || phase !== 'playing' ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" /> {providerLabel(extEmbed.provider)}
            </span>
            <button onClick={() => extNextRef.current?.()} className="text-[var(--aj-acc-hi)] transition hover:text-white">
              switch provider
            </button>
            {hasNext && (
              <button onClick={onNextEpisode} className="text-[var(--aj-acc-hi)] transition hover:text-white">
                next ep
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Resolving / loading overlay ── */}
      {(phase === 'resolving' || phase === 'loading') && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-5 ${
            ytEmbed ? 'cursor-pointer bg-black' : 'bg-black/75 backdrop-blur-sm'
          }`}
          onClick={ytEmbed ? togglePlay : undefined}
        >
          <IconLoader size={44} className="aj-spin text-[var(--aj-acc)]" />
          <div className="text-center">
            <p className="text-sm font-semibold text-white/90">
              {phase === 'resolving' ? 'Resolving stream providers…' : 'Buffering stream…'}
            </p>
            <p className="mt-1 text-xs text-white/45">
              {anime.title} · Episode {episode}
            </p>
          </div>
          {ytEmbed && ytHint && (
            <p className="text-[12.5px] font-semibold text-white/70">Tap anywhere to start playback</p>
          )}
          {/* Provider chain status */}
          {providers.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-[11.5px]">
              {providers.map((p) => {
                const isActive = p.provider === activeProvider;
                return (
                  <li
                    key={p.provider}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${
                      p.ok
                        ? isActive
                          ? 'bg-[var(--aj-acc-15)] text-[var(--aj-acc-hi)] ring-1 ring-[var(--aj-acc-40)]'
                          : 'bg-white/[0.05] text-white/50'
                        : 'bg-white/[0.03] text-white/30'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${p.ok ? (isActive ? 'bg-[var(--aj-acc)]' : 'bg-[#4ade80]') : 'bg-white/25'}`} />
                    {providerLabel(p.provider)}
                    {!p.ok && !p.provider.startsWith('youtube') && (
                      <span className="opacity-60">· {p.error?.slice(0, 40)}</span>
                    )}
                    {p.ok && isActive && <span className="font-semibold">· streaming</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {fallbackNote && <p className="text-[12px] text-[var(--aj-acc-hi)]">{fallbackNote}</p>}
        </div>
      )}

      {/* ── Terminal error ── */}
      {phase === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e5484d]/15 text-[#ff6b70]">
            <IconAlert size={28} />
          </span>
          <div className="text-center">
            <p className="font-bold text-white">No stream available for this episode</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-white/50">
              The provider chain (gogoanime.by → relay search) could not serve this episode.
              Recent simulcast episodes are usually hosted; older ones depend on source availability.
            </p>
          </div>
          {officialLinks.length > 0 && (
            <div className="max-w-md">
              <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Watch officially
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {officialLinks.map((l) => (
                  <a
                    key={l.site + l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[12px] font-semibold text-white/80 ring-1 ring-white/15 transition hover:bg-white/15 hover:text-white"
                  >
                    {l.site}
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setPhase('resolving');
                fetchStreams(anime, episode)
                  .then((p) => {
                    sourcesRef.current = p.sources || [];
                    setProviders(p.providersTried || []);
                    setOfficialLinks(p.officialLinks || []);
                    if (p.sources?.length) attachSource(0);
                    else setPhase('error');
                  })
                  .catch(() => setPhase('error'));
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--aj-acc)] px-5 py-2.5 text-[13px] font-bold text-black transition hover:bg-[var(--aj-acc-hi2)]"
            >
              <IconRefresh size={14} /> Retry chain
            </button>
            <button
              onClick={onClose}
              className="rounded-full bg-white/10 px-5 py-2.5 text-[13px] font-semibold text-white/85 transition hover:bg-white/20"
            >
              Back to details
            </button>
          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className={`absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/85 to-transparent p-4 transition-opacity duration-300 md:p-5 ${showControls || phase !== 'playing' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white md:text-base">{anime.title}</p>
            <p className="mt-0.5 text-xs text-white/60">
              Episode {episode}
              {episodeTitle ? ` · ${episodeTitle}` : ''}
              {activeProvider && !activeProvider.startsWith('youtube') && (
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  <span className="h-1 w-1 rounded-full bg-[#4ade80]" /> {providerLabel(activeProvider)}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/50 text-white/85 transition hover:bg-black/80 hover:text-white"
            aria-label="Close player"
          >
            <IconClose size={18} />
          </button>
        </div>
      </div>

      {/* ── Bottom controls (Ajest-native for ALL sources) ── */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-3 pt-10 md:px-6 transition-opacity duration-300 ${
          extEmbed
            ? 'hidden'
            : showControls || phase !== 'playing'
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Seek bar */}
        <div
          className="group/seek relative -mx-1 cursor-pointer px-1 py-3"
          onClick={seekTo}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setSeekHover(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
          }}
          onMouseLeave={() => setSeekHover(null)}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          tabIndex={0}
        >
          <div className="relative h-1.5 rounded-full bg-white/20 transition-all group-hover/seek:h-2.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${bufPct}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--aj-acc)]" style={{ width: `${pct}%` }} />
            <span
              className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/seek:opacity-100"
              style={{ left: `calc(${pct}% - 7px)` }}
            />
          </div>
          {seekHover !== null && duration > 0 && (
            <span
              className="pointer-events-none absolute -top-4 rounded bg-black/85 px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ left: `calc(${seekHover * 100}% - 18px)` }}
            >
              {fmtTime(seekHover * duration)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-3.5">
          <button onClick={togglePlay} className="text-white transition hover:text-[var(--aj-acc)]" aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <IconPause size={24} /> : <IconPlay size={24} />}
          </button>
          <button onClick={() => seekBy(-10)} className="text-white/85 transition hover:text-white" aria-label="Back 10 seconds">
            <IconSkipBack size={19} />
          </button>
          <button onClick={() => seekBy(10)} className="text-white/85 transition hover:text-white" aria-label="Forward 10 seconds">
            <IconSkipForward size={19} />
          </button>

          {/* Volume */}
          <div className="group/vol flex items-center gap-2">
            <button
              onClick={() => {
                if (ytActiveRef.current) {
                  const p = ytPlayerRef.current;
                  if (p) {
                    if (ytInfo.current.muted) p.unMute();
                    else p.mute();
                  }
                  return;
                }
                const v = videoRef.current;
                if (v) {
                  v.muted = !v.muted;
                  setMuted(v.muted);
                }
              }}
              className="text-white/85 transition hover:text-white"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              <VolIcon size={19} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                if (ytActiveRef.current) {
                  const p = ytPlayerRef.current;
                  const vol = parseFloat(e.target.value);
                  if (p) {
                    p.setVolume(Math.round(vol * 100));
                    if (vol > 0) p.unMute();
                  }
                  setVolume(vol);
                  setMuted(vol === 0);
                  return;
                }
                const v = videoRef.current;
                if (v) {
                  v.volume = parseFloat(e.target.value);
                  v.muted = parseFloat(e.target.value) === 0;
                }
              }}
              className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/25 opacity-0 transition-all duration-300 group-hover/vol:w-20 group-hover/vol:opacity-100 accent-[var(--aj-acc)] md:w-16 md:opacity-100"
              aria-label="Volume"
            />
          </div>

          <span className="ml-1 font-mono text-[11.5px] tabular-nums text-white/75">
            {fmtTime(current)} <span className="text-white/35">/ {fmtTime(duration)}</span>
          </span>

          <div className="flex-1" />

          {/* Settings */}
          <div className="relative">
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              className={`transition ${settingsOpen ? 'text-[var(--aj-acc)]' : 'text-white/85 hover:text-white'}`}
              aria-label="Playback settings"
              aria-expanded={settingsOpen}
            >
              <IconGear size={19} />
            </button>
            {settingsOpen && (
              <div className="absolute bottom-10 right-0 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#171b24]/97 p-1.5 shadow-2xl backdrop-blur">
                <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40">Quality</p>
                {levels.length ? (
                  levels.map((l) => (
                    <button
                      key={l.index}
                      onClick={() => changeLevel(l.index)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px] transition hover:bg-white/[0.07] ${
                        activeLevel === l.index ? 'text-[var(--aj-acc)] font-semibold' : 'text-white/80'
                      }`}
                    >
                      {l.height}p {activeLevel === l.index && <IconCheck size={13} />}
                    </button>
                  ))
                ) : (
                  <p className="px-2.5 py-1.5 text-[12px] text-white/40">Auto (source default)</p>
                )}
                <button
                  onClick={() => changeLevel(-1)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px] transition hover:bg-white/[0.07] ${
                    activeLevel === -1 ? 'text-[var(--aj-acc)] font-semibold' : 'text-white/80'
                  }`}
                >
                  Auto {activeLevel === -1 && <IconCheck size={13} />}
                </button>
                <p className="mt-1 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40">Speed</p>
                {[0.75, 1, 1.25, 1.5, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => changeSpeed(s)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px] transition hover:bg-white/[0.07] ${
                      speed === s ? 'text-[var(--aj-acc)] font-semibold' : 'text-white/80'
                    }`}
                  >
                    {s}× {speed === s && <IconCheck size={13} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasNext && (
            <button
              onClick={onNextEpisode}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-[12px] font-semibold text-white/85 transition hover:bg-[var(--aj-acc)] hover:text-black"
            >
              Next EP <IconSkipForward size={13} />
            </button>
          )}

          <button onClick={toggleFullscreen} className="text-white/85 transition hover:text-white" aria-label="Toggle fullscreen">
            {isFullscreen ? <IconFullscreenExit size={19} /> : <IconFullscreen size={19} />}
          </button>
        </div>

        {fallbackNote && phase === 'playing' && (
          <p className="mt-1.5 text-center text-[11px] text-[var(--aj-acc-hi-80)]">{fallbackNote}</p>
        )}
      </div>
    </div>
  );
}
