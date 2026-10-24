'use client';

// ── Storage that never throws ────────────────────────────────────────────────
// Old iOS Safari (Private Browsing, and any full-quota state) throws from
// localStorage access. Every zustand persist store goes through this shim:
//   • working localStorage  → used transparently
//   • throwing localStorage → silent in-memory fallback (session-only)
// Reads are also guarded, and a warm-up probe decides the mode once.

const mem = new Map<string, string>();
let lsWorks: boolean | null = null;

function probe(): boolean {
  if (typeof window === 'undefined') return false;
  if (lsWorks !== null) return lsWorks;
  try {
    const k = '__aj_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    lsWorks = true;
  } catch {
    lsWorks = false; // private mode / quota / disabled storage
  }
  return lsWorks;
}

/** localStorage-compatible object that cannot throw. */
export const safeLocalStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem(key: string): string | null {
    if (probe()) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        /* fall through to memory */
      }
    }
    return mem.has(key) ? (mem.get(key) as string) : null;
  },
  setItem(key: string, value: string): void {
    if (probe()) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        /* quota exceeded → keep in memory */
      }
    }
    mem.set(key, value);
  },
  removeItem(key: string): void {
    if (probe()) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    mem.delete(key);
  },
};
