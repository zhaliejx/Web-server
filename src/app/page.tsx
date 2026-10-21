'use client';

import dynamic from 'next/dynamic';

// Client-only: the app reads localStorage (user libraries) and runs the
// cinematic splash sequence, so SSR is intentionally skipped.
const AjestApp = dynamic(() => import('@/components/ajest/AjestApp'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0d12]">
      <svg width="46" height="46" viewBox="0 0 48 48" className="aj-spin opacity-80" aria-label="Loading Ajest">
        <defs>
          <linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFB347" />
            <stop offset="100%" stopColor="#F4511E" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="18" fill="none" stroke="#1c212c" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke="url(#pg)"
          strokeWidth="4"
          strokeDasharray="40 113"
          strokeLinecap="round"
        />
      </svg>
    </div>
  ),
});

export default function Home() {
  return <AjestApp />;
}
