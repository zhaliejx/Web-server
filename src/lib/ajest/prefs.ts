'use client';

// ── Source provider registry + user preferences (localStorage-backed) ───────
// The streams resolver follows the chain: ani.pm → gogo → AnimeKaizen →
// YouTube. Users can toggle any of them, and the Player forwards the enabled
// set to /api/streams so disabled tiers are never even contacted — which also
// makes resolution faster.
//
// DEFAULTS: only the primary tier (Ani.pm) is enabled. Backup
// mirrors stay OFF unless the user turns them on — direct-stream tiers relay
// video through the server and would burn through the hosting plan's
// bandwidth quota with a shared household of viewers. Embed tiers (kaizen,
// youtube) cost nothing to enable, but off-by-default keeps every device on
// the safe, predictable configuration.

import { useCallback, useEffect, useState } from 'react';

export const PROVIDER_ORDER = ['anipm', 'gogo', 'kaizen', 'youtube'] as const;
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
  anipm: {
    id: 'anipm',
    label: 'Ani.pm',
    blurb: 'First in the chain — verified full episodes, sub & dub, checked in your browser before it plays. Widest HD coverage.',
    kind: 'embed',
    badge: 'First',
  },
  gogo: {
    id: 'gogo',
    label: 'Gogoanime',
    blurb: 'Direct stream files with Ajest controls — progress bar, resume, auto-next. Recent shows only. Off by default: heavy on server data.',
    kind: 'native',
    badge: 'Best experience',
  },
  kaizen: {
    id: 'kaizen',
    label: 'AnimeKaizen',
    blurb: 'Google-hosted mirror for the latest episode of select shows. Zero-cost extra fallback. Off by default — free to enable.',
    kind: 'embed',
    badge: 'Mirror',
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    blurb: 'Official channel uploads — full episodes from Muse Asia, Crunchyroll and friends. Region-dependent. Off by default — free to enable.',
    kind: 'native',
    badge: 'Legit',
  },
};

/** Tiers off unless the user explicitly enables them — everything but the
 *  primary ani.pm tier. Direct tiers relay video through the server, so a
 *  10-viewer household on always-on defaults would exhaust the monthly
 *  bandwidth quota in weeks. */
export const DEFAULT_DISABLED: ProviderId[] = ['gogo', 'kaizen', 'youtube'];

// v2: bumped so existing devices (which stored "everything enabled") pick up
// the family-safe defaults on their next visit.
const LS_KEY = 'ajest-sources-v2';

export interface SourcePrefs {
  disabled: ProviderId[];
}

export function loadSourcePrefs(): SourcePrefs {
  if (typeof window === 'undefined') return { disabled: DEFAULT_DISABLED };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { disabled: DEFAULT_DISABLED };
    const p = JSON.parse(raw) as SourcePrefs;
    const disabled = Array.isArray(p.disabled)
      ? p.disabled.filter((d): d is ProviderId => (PROVIDER_ORDER as readonly string[]).includes(d))
      : [];
    // Never allow disabling everything — if somehow everything is off, fall
    // back to the safe defaults (primary on) instead of re-enabling relays.
    return { disabled: disabled.length >= PROVIDER_ORDER.length ? DEFAULT_DISABLED : disabled };
  } catch {
    return { disabled: DEFAULT_DISABLED };
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
    saveSourcePrefs({ disabled: DEFAULT_DISABLED });
    setDisabled(DEFAULT_DISABLED);
  }, []);
  return { disabled, toggle, reset };
}

// ── Drama source registry + preferences ─────────────────────────────────────
// Chain: Dramacool direct HLS → Dramacool hoster mirrors (Vidmoly, Streamtape,
// MixDrop, AsianCTV…) → MyAsianTV. The direct tier relays video through the
// server proxy and burns bandwidth; the mirror tiers are provider-rendered
// iframes that cost the server nothing. Defaults follow the family-safe rule:
// free tiers on, relay tier off unless explicitly enabled.

export const DRAMA_SOURCE_ORDER = ['dc-hls', 'dc-embeds', 'mat'] as const;
export type DramaSourceId = (typeof DRAMA_SOURCE_ORDER)[number];

export interface DramaSourceMeta {
  id: DramaSourceId;
  label: string;
  blurb: string;
  badge: string;
}

export const DRAMA_SOURCES: Record<DramaSourceId, DramaSourceMeta> = {
  'dc-hls': {
    id: 'dc-hls',
    label: 'Dramacool direct',
    blurb: 'Native Ajest player on a pre-resolved HLS stream — only when the source managed to pre-resolve it. Relays video through the server, so it stays off by default.',
    badge: 'Heavy',
  },
  'dc-embeds': {
    id: 'dc-embeds',
    label: 'Dramacool mirrors',
    blurb: 'Every hoster the episode carries — Vidmoly, Streamtape, MixDrop, AsianCTV. Provider-rendered players with their own controls. Zero server data. On by default.',
    badge: 'First',
  },
  mat: {
    id: 'mat',
    label: 'MyAsianTV',
    blurb: 'Independent mirror hosting most of the same episodes with a built-in server switcher inside its player. Zero server data. On by default.',
    badge: 'Backup',
  },
};

/** Direct HLS relays video through the server proxy — opt-in only. */
export const DRAMA_DEFAULT_DISABLED: DramaSourceId[] = ['dc-hls'];

const DRAMA_LS_KEY = 'ajest-drama-sources-v1';

export interface DramaSourcePrefs {
  disabled: DramaSourceId[];
}

export function loadDramaSourcePrefs(): DramaSourcePrefs {
  if (typeof window === 'undefined') return { disabled: DRAMA_DEFAULT_DISABLED };
  try {
    const raw = window.localStorage.getItem(DRAMA_LS_KEY);
    if (!raw) return { disabled: DRAMA_DEFAULT_DISABLED };
    const p = JSON.parse(raw) as DramaSourcePrefs;
    const disabled = Array.isArray(p.disabled)
      ? p.disabled.filter((d): d is DramaSourceId =>
          (DRAMA_SOURCE_ORDER as readonly string[]).includes(d)
        )
      : [];
    return { disabled: disabled.length >= DRAMA_SOURCE_ORDER.length ? DRAMA_DEFAULT_DISABLED : disabled };
  } catch {
    return { disabled: DRAMA_DEFAULT_DISABLED };
  }
}

export function saveDramaSourcePrefs(prefs: DramaSourcePrefs) {
  try {
    window.localStorage.setItem(DRAMA_LS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — session-only */
  }
  window.dispatchEvent(new CustomEvent('ajest-drama-sources-changed'));
}

export function enabledDramaSources(): DramaSourceId[] {
  const { disabled } = loadDramaSourcePrefs();
  return DRAMA_SOURCE_ORDER.filter((s) => !disabled.includes(s));
}

/** React hook — toggles + subscribes to changes across components. */
export function useDramaSourcePrefs(): {
  disabled: DramaSourceId[];
  toggle: (id: DramaSourceId) => void;
  reset: () => void;
} {
  const [disabled, setDisabled] = useState<DramaSourceId[]>(() =>
    typeof window === 'undefined' ? [] : loadDramaSourcePrefs().disabled
  );
  useEffect(() => {
    const sync = () => setDisabled(loadDramaSourcePrefs().disabled);
    window.addEventListener('ajest-drama-sources-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('ajest-drama-sources-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const toggle = useCallback((id: DramaSourceId) => {
    const cur = loadDramaSourcePrefs();
    const next = cur.disabled.includes(id)
      ? cur.disabled.filter((d) => d !== id)
      : [...cur.disabled, id];
    if (next.length < DRAMA_SOURCE_ORDER.length) {
      saveDramaSourcePrefs({ disabled: next });
      setDisabled(next);
    }
  }, []);
  const reset = useCallback(() => {
    saveDramaSourcePrefs({ disabled: DRAMA_DEFAULT_DISABLED });
    setDisabled(DRAMA_DEFAULT_DISABLED);
  }, []);
  return { disabled, toggle, reset };
}

// ── Audio preference (Sub ⇄ Dub) ────────────────────────────────────────────
// Applies to the ani.pm HD-player tier, whose partner API exposes per-episode
// sub/dub availability (episodeList[n].available.dub + ready-made /dub embed
// URLs). Other tiers are sub-only, so dub gracefully degrades: the streams
// route still returns the full chain, and the Player auto-falls-back to sub
// per episode when the partner API reports no dub. Default: sub.

export type AudioPref = 'sub' | 'dub';

const AUDIO_LS_KEY = 'ajest.audio.v1';

export function loadAudioPref(): AudioPref {
  if (typeof window === 'undefined') return 'sub';
  try {
    return window.localStorage.getItem(AUDIO_LS_KEY) === 'dub' ? 'dub' : 'sub';
  } catch {
    return 'sub';
  }
}

export function saveAudioPref(p: AudioPref) {
  try {
    window.localStorage.setItem(AUDIO_LS_KEY, p);
  } catch {
    /* storage unavailable — session-only */
  }
  window.dispatchEvent(new CustomEvent('ajest-audio-changed'));
}

/** React hook — audio track preference, synced across components. */
export function useAudioPref(): [AudioPref, (p: AudioPref) => void] {
  const [pref, setPref] = useState<AudioPref>(() =>
    typeof window === 'undefined' ? 'sub' : loadAudioPref()
  );
  useEffect(() => {
    const sync = () => setPref(loadAudioPref());
    window.addEventListener('ajest-audio-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('ajest-audio-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const set = useCallback((p: AudioPref) => {
    saveAudioPref(p);
    setPref(p);
  }, []);
  return [pref, set];
}

// ── Manga source registry + preferences ─────────────────────────────────────
// Chain: MangaFire → MangaPill → MangaRead → MangaDex. MangaFire is embed-only
// (its reader opens in an iframe on the series page), MangaPill/MangaRead are
// server-scraped mirrors that merge into search and fill missing chapter
// lists, and MangaDex is the rich catalog underneath it all. Toggling a source
// removes it from search, from the chapter fallback chain and from the UI.

export const MANGA_SOURCE_ORDER = ['mangafire', 'mangapill', 'mangaread', 'mangadex'] as const;
export type MangaSourceId = (typeof MANGA_SOURCE_ORDER)[number];

export interface MangaSourceMeta {
  id: MangaSourceId;
  label: string;
  blurb: string;
  badge: string;
}

export const MANGA_SOURCES: Record<MangaSourceId, MangaSourceMeta> = {
  mangafire: {
    id: 'mangafire',
    label: 'MangaFire',
    blurb: 'First in the chain — biggest library of all, embedded reader (iframe) on every series page. Carries licensed titles like Solo Leveling in full.',
    badge: 'Iframe',
  },
  mangapill: {
    id: 'mangapill',
    label: 'MangaPill',
    blurb: 'Fast lightweight mirror, second in the chain. Images relay through Ajest; good coverage for older series.',
    badge: 'Mirror',
  },
  mangaread: {
    id: 'mangaread',
    label: 'MangaRead',
    blurb: 'Biggest official-title mirror — fills in licensed series (Solo Leveling, My Dress-Up Darling…) with full chapter lists.',
    badge: 'Most complete',
  },
  mangadex: {
    id: 'mangadex',
    label: 'MangaDex',
    blurb: 'Last in the chain — community catalog with ratings, follows and the home rails. Some licensed titles have no readable chapters here.',
    badge: 'Catalog',
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
