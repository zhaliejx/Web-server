'use client';

// ── User libraries persisted to localStorage ────────────────────────────────
//   • History     — watched episodes with progress timestamps, newest first
//   • Liked       — favorite series toggled via SVG heart
//   • Watch Later — bookmark queue toggled via SVG bookmark

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AnimeCard, HistoryEntry } from './types';

// ── History ──────────────────────────────────────────────────────────────────
interface HistoryState {
  entries: Record<string, HistoryEntry>;
  upsert: (entry: HistoryEntry) => void;
  remove: (animeId: string, episodeNumber?: number) => void;
  clear: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      entries: {},
      upsert: (entry) =>
        set((s) => {
          const prev = s.entries[entry.anime.id];
          // Keep the farthest progress unless this is a rewind re-watch of same ep
          const progress =
            prev && prev.episode.number === entry.episode.number
              ? Math.max(prev.progress, entry.progress)
              : entry.progress;
          return {
            entries: {
              ...s.entries,
              [entry.anime.id]: { ...entry, progress, updatedAt: Date.now() },
            },
          };
        }),
      remove: (animeId, episodeNumber) =>
        set((s) => {
          if (episodeNumber === undefined) {
            const next = { ...s.entries };
            delete next[animeId];
            return { entries: next };
          }
          const cur = s.entries[animeId];
          if (!cur) return s;
          return { entries: { ...s.entries } }; // single-episode removal not needed for series-keyed entries
        }),
      clear: () => set({ entries: {} }),
    }),
    { name: 'ajest.history.v1', storage: createJSONStorage(() => localStorage) }
  )
);

export function historySorted(entries: Record<string, HistoryEntry>): HistoryEntry[] {
  return Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt);
}

// ── Liked (favorites) ────────────────────────────────────────────────────────
interface LikedState {
  items: AnimeCard[];
  toggle: (a: AnimeCard) => void;
  has: (id: string) => boolean;
}

export const useLiked = create<LikedState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (a) =>
        set((s) =>
          s.items.some((x) => x.id === a.id)
            ? { items: s.items.filter((x) => x.id !== a.id) }
            : { items: [a, ...s.items] }
        ),
      has: (id) => get().items.some((x) => x.id === id),
    }),
    { name: 'ajest.liked.v1', storage: createJSONStorage(() => localStorage) }
  )
);

// ── Watch Later (bookmarks) ──────────────────────────────────────────────────
interface LaterState {
  items: AnimeCard[];
  toggle: (a: AnimeCard) => void;
  has: (id: string) => boolean;
}

export const useWatchLater = create<LaterState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (a) =>
        set((s) =>
          s.items.some((x) => x.id === a.id)
            ? { items: s.items.filter((x) => x.id !== a.id) }
            : { items: [a, ...s.items] }
        ),
      has: (id) => get().items.some((x) => x.id === id),
    }),
    { name: 'ajest.later.v1', storage: createJSONStorage(() => localStorage) }
  )
);
