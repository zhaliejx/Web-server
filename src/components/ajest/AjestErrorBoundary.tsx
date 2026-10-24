'use client';

import { Component, type ReactNode } from 'react';

// ── Boot/render error shield ────────────────────────────────────────────────
// If anything in the app crashes client-side (an old Safari edge, a corrupt
// localStorage payload, a bad chunk), the old behavior was an eternal spinner
// over a blank page. This boundary converts ANY render crash into an honest
// card with a reload button.

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AjestErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Keep a breadcrumb in the console for remote debugging reports
    console.error('[ajest] render crash:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0d12] px-6 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
            style={{ background: 'var(--aj-acc-15, rgba(255,122,26,.15))', color: 'var(--aj-acc, #ff7a1a)' }}
            aria-hidden
          >
            !
          </div>
          <h1 className="text-lg font-bold text-white">Something tripped on this device</h1>
          <p className="max-w-sm text-[13px] leading-relaxed text-white/55">
            A part of the app failed to start. Reloading usually fixes it — if it keeps happening, try
            clearing this site&apos;s website data (old Safari occasionally keeps a broken cached copy).
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-[var(--aj-acc, #ff7a1a)] px-6 py-2.5 text-[13px] font-bold text-black"
          >
            Reload Ajest
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
