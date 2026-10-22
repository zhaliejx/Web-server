'use client';

// ── MangaFire embed — full-screen iframe overlay of MangaFire's own reader ──
// MangaFire is chain-first for manga/manhwa but has no server-scrapeable API,
// so Ajest embeds the live site instead: the user picks the series (their
// search opens pre-filled with our title) and reads inside the frame with
// MangaFire's native UI. No sandbox — MangaFire (like ani.pm) refuses
// sandboxed frames, and the overlay chrome keeps navigation inside Ajest.

import { useEffect, useState } from 'react';
import { mfBrowseEmbed } from '@/lib/ajest/mangafire';
import { IconClose } from './icons';

interface Props {
  title: string;
  /** Button label — defaults to "MangaFire" */
  label?: string;
  /** Compact = icon-only round button (reader toolbar); default = pill button */
  compact?: boolean;
  className?: string;
}

export function MangaFireEmbed({ title, label = 'MangaFire', compact = false, className = '' }: Props) {
  const [open, setOpen] = useState(false);

  // Esc closes while the overlay is up
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`Read ${title} on MangaFire (embedded)`}
        className={
          className ||
          (compact
            ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition hover:bg-white/[0.14] hover:text-white'
            : 'inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-5 py-2.5 text-[13.5px] font-semibold text-white/85 transition hover:scale-[1.03] active:scale-95 hover:bg-white/[0.13]')
        }
      >
        <svg width={compact ? 15 : 14} height={compact ? 15 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
        {!compact && label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[85] bg-black" role="dialog" aria-label={`${title} — MangaFire embedded reader`}>
          {/* Overlay chrome */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/90 to-transparent px-3 py-2.5 md:px-5">
            <button
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-white/85 backdrop-blur transition hover:bg-white/[0.22] hover:text-white"
              aria-label="Close MangaFire reader"
            >
              <IconClose size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-white/90">{title}</p>
              <p className="truncate text-[11px] text-white/45">
                Embedded reader · pick the series, then read right here
              </p>
            </div>
            <span className="hidden shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white/55 sm:block">
              MangaFire
            </span>
          </div>
          {/* Frame — full height so their reader scrolls naturally; the top
              chrome floats above and the reader content starts beneath it */}
          <iframe
            src={mfBrowseEmbed(title)}
            className="absolute inset-0 h-full w-full border-0 bg-white"
            allow="fullscreen"
            referrerPolicy="no-referrer-when-downgrade"
            title={`${title} on MangaFire`}
          />
        </div>
      )}
    </>
  );
}
