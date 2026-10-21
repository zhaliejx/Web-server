'use client';

// ── App-level controls: immersive fullscreen toggle + PWA install chip ──────
// Makes Ajest behave like a real installable web app. All glyphs are inline SVG.

import { useCallback, useEffect, useState } from 'react';
import { IconFullscreen, IconFullscreenExit, IconInstall } from './icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function AppControls({ compact = false }: { compact?: boolean }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsSupported] = useState(
    () =>
      typeof document !== 'undefined' &&
      !!(
        document.documentElement.requestFullscreen ||
        (document.documentElement as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen
      )
  );
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Track fullscreen state (also handles Esc key + F11 natively)
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement || !!(document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  // PWA install availability
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const flashHint = useCallback((msg: string) => {
    setHint(msg);
    setTimeout(() => setHint(null), 2600);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    try {
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        else {
          flashHint('Fullscreen is not supported in this browser');
          return;
        }
      } else if (doc.exitFullscreen) await doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
    } catch {
      flashHint('Fullscreen was blocked — try again or press F11');
    }
  }, [flashHint]);

  const install = useCallback(async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    const choice = await installEvt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') flashHint('Ajest installed — launch it from your home screen');
    setInstallEvt(null);
  }, [installEvt, flashHint]);

  return (
    <div className="relative flex items-center gap-2">
      {/* Install app chip (only when the browser offers installation) */}
      {installEvt && (
        <button
          onClick={install}
          className={`inline-flex items-center gap-1.5 rounded-full bg-[#ff7a1a] px-3.5 py-2 text-[12px] font-bold text-black transition hover:bg-[#ff8d3d] focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${compact ? 'px-3' : ''}`}
          aria-label="Install Ajest as an app"
          title="Install Ajest as an app"
        >
          <IconInstall size={14} />
          <span className={compact ? 'hidden' : 'hidden sm:inline'}>Install app</span>
        </button>
      )}

      {/* Immersive fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        aria-pressed={isFullscreen}
        title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen app (F)'}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a1a] ${
          isFullscreen
            ? 'bg-[#ff7a1a]/20 text-[#ffb37a] ring-1 ring-[#ff7a1a]/40'
            : 'bg-white/[0.07] text-white/75 hover:bg-white/[0.14] hover:text-white'
        }`}
      >
        {isFullscreen ? <IconFullscreenExit size={17} /> : <IconFullscreen size={17} />}
      </button>

      {/* Non-blocking hint toast */}
      {hint && (
        <span
          role="status"
          className="absolute right-0 top-11 z-50 w-max max-w-[240px] rounded-xl border border-white/10 bg-[#171b24]/95 px-3.5 py-2 text-[11.5px] leading-snug text-white/85 shadow-2xl backdrop-blur"
        >
          {hint}
        </span>
      )}
      {!fsSupported && <span className="sr-only">Fullscreen not supported</span>}
    </div>
  );
}
