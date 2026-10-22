'use client';

// ── Ajest icon system — 100% hand-authored inline SVG ───────────────────────
// Zero PNGs, zero JPEGs, zero icon fonts. Every glyph below is pure SVG code.

import { useId } from 'react';

export interface IconProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
}

function Svg({
  size = 24,
  className,
  strokeWidth = 2,
  children,
  filled = false,
  viewBox = '0 0 24 24',
}: IconProps & { children: React.ReactNode; viewBox?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? 0 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

// ── Brand mark: gradient app tile with a play glyph + broadcast spark ────────
// Theme-aware: the tile inherits the user's accent (--aj-acc* variables), so
// switching themes recolors the logo everywhere. Same design as the static
// /ajest-icon.svg favicon, which keeps the default Ember palette.
export function AjestMark({
  size = 44,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Unique gradient id per instance — several marks can coexist in the DOM
  const uid = useId().replace(/[:]/g, '');
  const tileId = `aj-tile-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="Ajest logo"
    >
      <defs>
        <linearGradient id={tileId} x1="12%" y1="0%" x2="88%" y2="100%">
          <stop offset="0%" style={{ stopColor: 'var(--aj-acc-hi2, #ff8d3d)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--aj-acc, #ff7a1a)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--aj-acc-deep, #9e4c10)' }} />
        </linearGradient>
      </defs>
      {/* Rounded gradient tile with a crisp inner edge */}
      <rect x="1" y="1" width="46" height="46" rx="13" fill={`url(#${tileId})`} />
      <rect x="1.5" y="1.5" width="45" height="45" rx="12.5" fill="none" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="1" />
      {/* Play triangle — optical center */}
      <path
        d="M19.4 16.9a1.9 1.9 0 0 1 2.85-1.64l11.5 7.1a1.9 1.9 0 0 1 0 3.28l-11.5 7.1a1.9 1.9 0 0 1-2.85-1.64z"
        fill="#ffffff"
      />
      {/* Broadcast spark */}
      <circle cx="36.6" cy="11.4" r="2.5" fill="#ffffff" opacity="0.9" />
    </svg>
  );
}

// ── Navigation ───────────────────────────────────────────────────────────────
export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.8 12 3l9 7.8" />
    <path d="M5.5 9.5V21h13V9.5" />
    <path d="M9.5 21v-6.2h5V21" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.6 16.6 4.4 4.4" />
  </Svg>
);

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18" />
    <path d="M8 3v4M16 3v4" />
    <path d="M7.5 14h3M13.5 14h3M7.5 17.5h3" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.4 2" />
  </Svg>
);

export const IconHeart = ({ filled, ...p }: IconProps) =>
  filled ? (
    <Svg {...p} filled>
      <path d="M12 21.1 4.7 14.4a5.6 5.6 0 0 1 0-8 5.4 5.4 0 0 1 7.6 0l-.3-.3.3.3a5.4 5.4 0 0 1 7.4.2 5.6 5.6 0 0 1 .3 7.9z" />
    </Svg>
  ) : (
    <Svg {...p}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </Svg>
  );

export const IconBookmark = ({ filled, ...p }: IconProps) => (
  <Svg {...p} filled={filled}>
    <path d="M19 21l-7-4.2L5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </Svg>
);

// ── Player controls ──────────────────────────────────────────────────────────
export const IconPlay = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M7.5 4.8v14.4a.7.7 0 0 0 1.07.6l11-7.2a.7.7 0 0 0 0-1.2l-11-7.2a.7.7 0 0 0-1.07.6z" />
  </Svg>
);

export const IconPause = (p: IconProps) => (
  <Svg {...p} filled>
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
  </Svg>
);

export const IconSkipBack = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M19.5 5.4v13.2a.8.8 0 0 1-1.25.66L9 13.1v5.5a1 1 0 0 1-2 0v-13a1 1 0 0 1 2 0v5.6l9.25-6.5a.8.8 0 0 1 1.25.7z" />
  </Svg>
);

export const IconSkipForward = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M4.5 5.4v13.2a.8.8 0 0 0 1.25.66L15 13.1v5.5a1 1 0 0 0 2 0v-13a1 1 0 0 0-2 0v5.6L5.75 4.7a.8.8 0 0 0-1.25.7z" />
  </Svg>
);

export const IconVolume = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 5.5 6.5 9H3.5v6h3L11 18.5z" fill="currentColor" stroke="none" />
    <path d="M15 9a4.2 4.2 0 0 1 0 6" />
    <path d="M17.8 6.4a8 8 0 0 1 0 11.2" />
  </Svg>
);

export const IconVolumeLow = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 5.5 6.5 9H3.5v6h3L11 18.5z" fill="currentColor" stroke="none" />
    <path d="M15 9a4.2 4.2 0 0 1 0 6" />
  </Svg>
);

export const IconVolumeMuted = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 5.5 6.5 9H3.5v6h3L11 18.5z" fill="currentColor" stroke="none" />
    <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
  </Svg>
);

export const IconFullscreen = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
  </Svg>
);

export const IconFullscreenExit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />
  </Svg>
);

export const IconInstall = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v10.5" />
    <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
    <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
  </Svg>
);

export const IconGear = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.4" />
    <path d="M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
  </Svg>
);

// ── Interface ────────────────────────────────────────────────────────────────
export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 9 7 7 7-7" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />
  </Svg>
);

export const IconStar = ({ filled, ...p }: IconProps) => (
  <Svg {...p} filled={filled}>
    <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="7.8" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 3.9 1.9 18.2a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4.5" />
    <circle cx="12" cy="17.2" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
    <path d="M20.5 3.5V8H16" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13.5h9l1-13.5" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);

export const IconFlame = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 22c4.4 0 7.5-2.9 7.5-7 0-3-1.8-5.2-3.4-7C14.6 6.3 13.5 4.6 13.5 2c-3 1.8-4.6 4.4-4.7 6.8-.9-.6-1.6-1.5-2-2.6C5.2 8 4.5 10.3 4.5 12.6 4.5 19.1 7.6 22 12 22z" />
    <path d="M12 22c2 0 3.4-1.5 3.4-3.5 0-1.6-1-2.7-2-4-1 1.3-2 2.4-2 4" />
  </Svg>
);

export const IconGlobe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18z" />
  </Svg>
);

export const IconFilm = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" />
  </Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18.1l-1.8-5.5L4.7 10.8 10.2 9z" />
    <path d="M19 3.5v3M20.5 5h-3M5.5 17.5v3M7 19h-3" />
  </Svg>
);

export const IconBadge = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="9.5" r="5.5" />
    <path d="m8.8 13.8-1.6 6.4 4.8-2.6 4.8 2.6-1.6-6.4" />
  </Svg>
);

export const IconSatellite = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2.2" />
    <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.4 4.6a10.5 10.5 0 0 1 0 14.8M4.6 19.4a10.5 10.5 0 0 1 0-14.8" />
  </Svg>
);

export const IconLoader = ({ size = 24, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="42" strokeDashoffset="28" strokeLinecap="round" />
  </svg>
);

// ── Source tier badges (SVG text glyphs) ─────────────────────────────────────
export function TierBadge({ tier, className }: { tier: string; className?: string }) {
  const map: Record<string, { label: string; title: string }> = {
    anilist: { label: 'AL', title: 'AniList (primary tier)' },
    kitsu: { label: 'K', title: 'Kitsu (fallback tier 1)' },
    gogo: { label: 'G', title: 'Gogoanime.by directory (fallback tier 2)' },
  };
  const info = map[tier] || { label: 'AL', title: 'AniList' };
  return (
    <svg width="34" height="18" viewBox="0 0 34 18" className={className} role="img" aria-label={info.title}>
      <rect x="0.75" y="0.75" width="32.5" height="16.5" rx="8.25" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
      <text
        x="17"
        y="12.7"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="700"
        fill="currentColor"
        fontFamily="inherit"
        letterSpacing="0.5"
      >
        {info.label}
      </text>
    </svg>
  );
}
