'use client';

import { IconClock, IconTrash } from './icons';

// ── Recent searches — shared chip row for all three search views ────────────
// Entries self-expire after 3 days (see src/lib/ajest/recent.ts); this row
// only renders what is still alive at mount/refresh time.
export function RecentSearches({
  items,
  onPick,
  onClear,
}: {
  items: string[];
  onPick: (q: string) => void;
  onClear: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="aj-rise">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/40">
          <IconClock size={13} /> Recent searches
          <span className="font-medium normal-case tracking-normal text-white/25">· kept 3 days</span>
        </p>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-[11.5px] font-semibold text-white/40 transition hover:text-[#ff6b70]"
          aria-label="Clear recent searches"
        >
          <IconTrash size={12} /> Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.09] bg-[#14171f] px-3.5 py-2 text-[12.5px] font-medium text-white/75 transition hover:border-[var(--aj-acc-60)] hover:text-white"
          >
            <span className="truncate">{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
