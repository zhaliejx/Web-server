'use client';

// ── Source settings modal — toggle every stream provider on/off ─────────────
// Preferences persist in localStorage and take effect on the next episode
// resolution (disabled tiers are never contacted, which also speeds the
// resolver up).

import { useEffect, useRef } from 'react';
import { PROVIDER_ORDER, PROVIDERS, useSourcePrefs } from '@/lib/ajest/prefs';
import { IconClose } from './icons';

export function SourceSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { disabled, toggle, reset } = useSourcePrefs();
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
        aria-label="Source settings"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#12151d] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 pb-4 pt-5">
          <div>
            <h2 className="text-[15px] font-bold tracking-wide text-white">Streaming sources</h2>
            <p className="mt-0.5 text-[11.5px] leading-snug text-white/45">
              Ajest tries these in order until one plays. Turn off what you don&apos;t want —
              disabled sources are skipped instantly.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close source settings"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/[0.12] hover:text-white"
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Toggles */}
        <ul className="flex flex-col divide-y divide-white/[0.05] px-2 py-1.5">
          {PROVIDER_ORDER.map((id) => {
            const meta = PROVIDERS[id];
            const on = !disabled.includes(id);
            return (
              <li key={id}>
                <button
                  onClick={() => toggle(id)}
                  role="switch"
                  aria-checked={on}
                  className="flex w-full items-center gap-3.5 rounded-xl px-3 py-3.5 text-left transition hover:bg-white/[0.035]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-bold ${on ? 'text-white' : 'text-white/35'}`}>
                        {meta.label}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          meta.kind === 'native'
                            ? 'bg-[#ff7a1a]/15 text-[#ffb37a]'
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
                      on ? 'bg-[#ff7a1a]' : 'bg-white/[0.14]'
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

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3.5">
          <span className="text-[10.5px] text-white/35">
            {PROVIDER_ORDER.length - disabled.length} of {PROVIDER_ORDER.length} sources enabled
          </span>
          {disabled.length > 0 && (
            <button
              onClick={reset}
              className="text-[11.5px] font-semibold text-[#ffb37a] transition hover:text-white"
            >
              Reset all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
