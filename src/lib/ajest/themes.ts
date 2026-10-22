'use client';

// ── Theme registry — one accent variable drives the whole app ───────────────
// Ember (orange) stays the default Ajest identity; the alternatives exist so
// the brand doesn't read as "that other orange streaming site". The selected
// theme persists in localStorage and is applied as data-aj-theme on <html>.

import { useCallback, useEffect, useState } from 'react';

export interface Theme {
  id: string;
  name: string;
  /** solid accent — buttons, active states */
  acc: string;
  /** soft highlight — warm text on accent-tinted surfaces */
  hi: string;
}

export const THEMES: Theme[] = [
  { id: '', name: 'Ember', acc: '#ff7a1a', hi: '#ffb37a' },
  { id: 'crimson', name: 'Crimson', acc: '#e50914', hi: '#ff8f96' },
  { id: 'violet', name: 'Violet', acc: '#a855f7', hi: '#d8b4fe' },
  { id: 'azure', name: 'Azure', acc: '#3b82f6', hi: '#a5c8ff' },
  { id: 'mint', name: 'Mint', acc: '#10b981', hi: '#7ce8c3' },
  { id: 'rose', name: 'Rose', acc: '#f43f5e', hi: '#fda4af' },
  { id: 'gold', name: 'Gold', acc: '#d9a406', hi: '#f3d060' },
  { id: 'platinum', name: 'Platinum', acc: '#e2e8f0', hi: '#ffffff' },
];

export const DEFAULT_THEME = ''; // '' → Ember (CSS :root default)

const LS_KEY = 'ajest-theme-v1';

export function loadTheme(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const v = window.localStorage.getItem(LS_KEY) || '';
    return THEMES.some((t) => t.id === v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Apply a theme id to the document root ('' = default Ember). */
export function applyTheme(id: string) {
  if (typeof document === 'undefined') return;
  if (id) document.documentElement.setAttribute('data-aj-theme', id);
  else document.documentElement.removeAttribute('data-aj-theme');
}

export function useTheme(): { theme: string; setTheme: (id: string) => void } {
  // Lazy init is SSR-safe (app renders client-only) and avoids setState-in-effect
  const [theme, setThemeState] = useState<string>(() => loadTheme());

  useEffect(() => {
    applyTheme(theme);
  }, []);

  const setTheme = useCallback((id: string) => {
    setThemeState(id);
    applyTheme(id);
    try {
      window.localStorage.setItem(LS_KEY, id);
    } catch {
      /* storage unavailable — session-only */
    }
  }, []);

  return { theme, setTheme };
}
