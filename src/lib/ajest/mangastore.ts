'use client';

// ── Manga libraries persisted to localStorage ───────────────────────────────
//   • MangaHistory — last chapter + page read per series (Continue Reading)
//   • MangaSaved   — bookmark queue (toggle via SVG bookmark)
//   • MangaLiked   — favorites (toggle via SVG heart)

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MangaHistoryEntry, MangaItem } from './types';

// ── Reading history ──────────────────────────────────────────────────────────
interface MangaHistoryState {
  entries: Record<string, MangaHistoryEntry>;
  upsert: (entry: MangaHistoryEntry) => void;
  remove: (mangaId: string) => void;
  clear: () => void;
}

export const useMangaHistory = create<MangaHistoryState>()(
  persist(
    (set) => ({
      entries: {},
      upsert: (entry) =>
        set((s) => {
          const prev = s.entries[entry.manga.id];
          // Keep the farthest page within the same chapter; a different
          // (usually newer) chapter replaces the entry outright.
          const page =
            prev && prev.chapter.id === entry.chapter.id
              ? Math.max(prev.page, entry.page)
              : entry.page;
          return {
            entries: {
              ...s.entries,
              [entry.manga.id]: { ...entry, page, updatedAt: Date.now() },
            },
          };
        }),
      remove: (mangaId) =>
        set((s) => {
          const next = { ...s.entries };
          delete next[mangaId];
          return { entries: next };
        }),
      clear: () => set({ entries: {} }),
    }),
    { name: 'ajest.manga.history.v1', storage: createJSONStorage(() => localStorage) }
  )
);

export function mangaHistorySorted(entries: Record<string, MangaHistoryEntry>): MangaHistoryEntry[] {
  return Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt);
}

// ── Shared list-store factory (saved / liked behave identically) ─────────────
function mangaListStore(name: string) {
  return create<{
    items: MangaItem[];
    toggle: (m: MangaItem) => void;
    has: (id: string) => boolean;
  }>()(
    persist(
      (set, get) => ({
        items: [],
        toggle: (m) =>
          set((s) =>
            s.items.some((x) => x.id === m.id)
              ? { items: s.items.filter((x) => x.id !== m.id) }
              : { items: [m, ...s.items] }
          ),
        has: (id) => get().items.some((x) => x.id === id),
      }),
      { name, storage: createJSONStorage(() => localStorage) }
    )
  );
}

export const useMangaSaved = mangaListStore('ajest.manga.saved.v1');
export const useMangaLiked = mangaListStore('ajest.manga.liked.v1');
