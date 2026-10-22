'use client';

// ── Source provider registry + user preferences (localStorage-backed) ───────
// The streams resolver supports multiple independent providers. Users can
// toggle any of them off (e.g. they dislike embed players), and the Player
// forwards the enabled set to /api/streams so disabled tiers are never even
// contacted — which also makes resolution faster.

import { useCallback, useEffect, useState } from 'react';

export const PROVIDER_ORDER = ['gogo', 'youtube', 'anipm', 'vidlink', 'kaizen'] as const;
export type ProviderId = (typeof PROVIDER_ORDER)[number];

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  blurb: string;
  /** native = Ajest's own controls (progress/resume); embed = provider's UI */
  kind: 'native' | 'embed';
  badge: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  gogo: {
    id: 'gogo',
    label: 'Direct streams',
    blurb: 'Real video files with Ajest controls — progress bar, resume, auto-next. Recent shows only.',
    kind: 'native',
    badge: 'Best experience',
  },
  youtube: {
    id: 'youtube',
    label: 'Official channel uploads',
    blurb: 'Full episodes from official anime channels (Muse Asia, Crunchyroll…). Region-dependent.',
    kind: 'native',
    badge: 'Legit',
  },
  anipm: {
    id: 'anipm',
    label: 'HD player',
    blurb: 'Verified full episodes — sub & dub — checked in your browser before it plays. Widest HD coverage.',
    kind: 'embed',
    badge: 'Recommended',
  },
  vidlink: {
    id: 'vidlink',
    label: 'Universal player',
    blurb: 'Multi-server backup that covers effectively every anime through TMDB. Heavier on ads.',
    kind: 'embed',
    badge: 'Backup',
  },
  kaizen: {
    id: 'kaizen',
    label: 'Kaizen mirror',
    blurb: 'Google-hosted mirror for the latest episode of select shows. Zero-cost extra fallback.',
    kind: 'embed',
    badge: 'Mirror',
  },
};

const LS_KEY = 'ajest-sources-v1';

export interface SourcePrefs {
  disabled: ProviderId[];
}

export function loadSourcePrefs(): SourcePrefs {
  if (typeof window === 'undefined') return { disabled: [] };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { disabled: [] };
    const p = JSON.parse(raw) as SourcePrefs;
    const disabled = Array.isArray(p.disabled)
      ? p.disabled.filter((d): d is ProviderId => (PROVIDER_ORDER as readonly string[]).includes(d))
      : [];
    // Never allow disabling everything — gogo+anipm minimum one must stay
    return { disabled: disabled.length >= PROVIDER_ORDER.length ? [] : disabled };
  } catch {
    return { disabled: [] };
  }
}

export function saveSourcePrefs(prefs: SourcePrefs) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — session-only */
  }
  window.dispatchEvent(new CustomEvent('ajest-sources-changed'));
}

export function enabledProviders(): ProviderId[] {
  const { disabled } = loadSourcePrefs();
  return PROVIDER_ORDER.filter((p) => !disabled.includes(p));
}

/** React hook — toggles + subscribes to changes across components. */
export function useSourcePrefs(): {
  disabled: ProviderId[];
  toggle: (id: ProviderId) => void;
  reset: () => void;
} {
  const [disabled, setDisabled] = useState<ProviderId[]>(() =>
    typeof window === 'undefined' ? [] : loadSourcePrefs().disabled
  );
  useEffect(() => {
    const sync = () => setDisabled(loadSourcePrefs().disabled);
    window.addEventListener('ajest-sources-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('ajest-sources-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const toggle = useCallback((id: ProviderId) => {
    const cur = loadSourcePrefs();
    const next = cur.disabled.includes(id)
      ? cur.disabled.filter((d) => d !== id)
      : [...cur.disabled, id];
    // Guard: keep at least one provider alive
    if (next.length < PROVIDER_ORDER.length) {
      saveSourcePrefs({ disabled: next });
      setDisabled(next);
    }
  }, []);
  const reset = useCallback(() => {
    saveSourcePrefs({ disabled: [] });
    setDisabled([]);
  }, []);
  return { disabled, toggle, reset };
}

// ── Manga source registry + preferences ─────────────────────────────────────
// Manga works differently from streams: all enabled tiers are merged into one
// search result list, and if MangaDex has no readable chapters for a series
// the gateway falls back to the scrape tiers automatically. Toggling a source
// removes it from search and from the fallback chain.

export const MANGA_SOURCE_ORDER = ['mangadex', 'mangaread', 'mangapill'] as const;
export type MangaSourceId = (typeof MANGA_SOURCE_ORDER)[number];

export interface MangaSourceMeta {
  id: MangaSourceId;
  label: string;
  blurb: string;
  badge: string;
}

export const MANGA_SOURCES: Record<MangaSourceId, MangaSourceMeta> = {
  mangadex: {
    id: 'mangadex',
    label: 'MangaDex',
    blurb: 'Community catalog with ratings, follows and the home rails. Some licensed titles have no readable chapters here.',
    badge: 'Default',
  },
  mangaread: {
    id: 'mangaread',
    label: 'MangaRead',
    blurb: 'Biggest official-title mirror — fills in licensed series (Solo Leveling, My Dress-Up Darling…) with full chapter lists.',
    badge: 'Most complete',
  },
  mangapill: {
    id: 'mangapill',
    label: 'MangaPill',
    blurb: 'Fast lightweight mirror. Images relay through Ajest; good extra coverage for older series.',
    badge: 'Mirror',
  },
};

const MANGA_LS_KEY = 'ajest-manga-sources-v1';

export interface MangaSourcePrefs {
  disabled: MangaSourceId[];
}

export function loadMangaSourcePrefs(): MangaSourcePrefs {
  if (typeof window === 'undefined') return { disabled: [] };
  try {
    const raw = window.localStorage.getItem(MANGA_LS_KEY);
    if (!raw) return { disabled: [] };
    const p = JSON.parse(raw) as MangaSourcePrefs;
    const disabled = Array.isArray(p.disabled)
      ? p.disabled.filter((d): d is MangaSourceId =>
          (MANGA_SOURCE_ORDER as readonly string[]).includes(d)
        )
      : [];
    return { disabled: disabled.length >= MANGA_SOURCE_ORDER.length ? [] : disabled };
  } catch {
    return { disabled: [] };
  }
}

export function saveMangaSourcePrefs(prefs: MangaSourcePrefs) {
  try {
    window.localStorage.setItem(MANGA_LS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — session-only */
  }
  window.dispatchEvent(new CustomEvent('ajest-manga-sources-changed'));
}

export function enabledMangaSources(): MangaSourceId[] {
  const { disabled } = loadMangaSourcePrefs();
  return MANGA_SOURCE_ORDER.filter((s) => !disabled.includes(s));
}

/** React hook — toggles + subscribes to changes across components. */
export function useMangaSourcePrefs(): {
  disabled: MangaSourceId[];
  toggle: (id: MangaSourceId) => void;
  reset: () => void;
} {
  const [disabled, setDisabled] = useState<MangaSourceId[]>(() =>
    typeof window === 'undefined' ? [] : loadMangaSourcePrefs().disabled
  );
  useEffect(() => {
    const sync = () => setDisabled(loadMangaSourcePrefs().disabled);
    window.addEventListener('ajest-manga-sources-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('ajest-manga-sources-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const toggle = useCallback((id: MangaSourceId) => {
    const cur = loadMangaSourcePrefs();
    const next = cur.disabled.includes(id)
      ? cur.disabled.filter((d) => d !== id)
      : [...cur.disabled, id];
    if (next.length < MANGA_SOURCE_ORDER.length) {
      saveMangaSourcePrefs({ disabled: next });
      setDisabled(next);
    }
  }, []);
  const reset = useCallback(() => {
    saveMangaSourcePrefs({ disabled: [] });
    setDisabled([]);
  }, []);
  return { disabled, toggle, reset };
}
