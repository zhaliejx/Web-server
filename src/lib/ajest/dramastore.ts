'use client';

// ── Drama libraries persisted to localStorage (mirrors mangastore.ts) ───────
//   • DramaHistory — last episode + seconds watched (Continue Watching +
//     watch-time resume; same policy as anime history)

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DramaHistoryEntry, DramaItem } from './types';
import { safeLocalStorage } from './safeStorage';

interface DramaHistoryState {
  entries: Record<string, DramaHistoryEntry>;
  upsert: (entry: DramaHistoryEntry) => void;
  remove: (slug: string) => void;
  clear: () => void;
}

export const useDramaHistory = create<DramaHistoryState>()(
  persist(
    (set) => ({
      entries: {},
      upsert: (entry) =>
        set((s) => {
          const prev = s.entries[entry.drama.slug];
          // Keep the farthest progress within the same episode; a different
          // (usually newer) episode replaces the entry outright.
          const progress =
            prev && prev.episode.number === entry.episode.number
              ? Math.max(prev.progress, entry.progress)
              : entry.progress;
          return {
            entries: {
              ...s.entries,
              [entry.drama.slug]: { ...entry, progress, updatedAt: Date.now() },
            },
          };
        }),
      remove: (slug) =>
        set((s) => {
          const next = { ...s.entries };
          delete next[slug];
          return { entries: next };
        }),
      clear: () => set({ entries: {} }),
    }),
    { name: 'ajest.drama.history.v1', storage: createJSONStorage(() => safeLocalStorage) }
  )
);

export function dramaHistorySorted(entries: Record<string, DramaHistoryEntry>): DramaHistoryEntry[] {
  return Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt);
}

// ── Shared list-store factory (saved / liked behave identically) ─────────────
function dramaListStore(name: string) {
  return create<{
    items: DramaItem[];
    toggle: (m: DramaItem) => void;
    has: (slug: string) => boolean;
  }>()(
    persist(
      (set, get) => ({
        items: [],
        toggle: (m) =>
          set((s) =>
            s.items.some((x) => x.slug === m.slug)
              ? { items: s.items.filter((x) => x.slug !== m.slug) }
              : { items: [m, ...s.items] }
          ),
        has: (slug) => get().items.some((x) => x.slug === slug),
      }),
      { name, storage: createJSONStorage(() => safeLocalStorage) }
    )
  );
}

export const useDramaSaved = dramaListStore('ajest.drama.saved.v1');
export const useDramaLiked = dramaListStore('ajest.drama.liked.v1');
