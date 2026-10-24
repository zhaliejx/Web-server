// ── Ajest shared types (used by both server routes and client) ──────────────

export interface AnimeCard {
  /** Internal composite id, e.g. "anilist:1535" | "kitsu:7442" | "gogo:slug" */
  id: string;
  anilistId?: number;
  malId?: number;
  title: string;
  titleEnglish?: string;
  titleRomaji?: string;
  titleNative?: string;
  cover: string;
  banner?: string;
  color?: string;
  /** Normalized 0-100 score */
  score?: number;
  format?: string; // TV, MOVIE, OVA...
  episodes?: number;
  /** Average episode duration in minutes (AniList `duration` / Kitsu `episodeLength`) */
  duration?: number;
  season?: string;
  seasonYear?: number;
  status?: string; // RELEASING, FINISHED...
  genres?: string[];
  studio?: string;
  description?: string;
  /** Unix seconds — for simulcast items */
  airingAt?: number;
  /** Episode number being aired (simulcast items) */
  episodeNo?: number;
  /** Next scheduled episode (detail view) */
  nextEpisodeAt?: number;
  source?: 'anilist' | 'kitsu' | 'gogo';
}

export interface EpisodeMeta {
  number: number;
  title?: string;
  /** Duration in minutes rendered on every episode card */
  durationMin: number;
  thumbnail?: string;
  airDate?: string;
  /** Unix seconds — exact airing moment for countdowns (ani.zip bridge) */
  airingAt?: number;
}

export interface DetailPayload {
  anime: AnimeCard;
  episodes: EpisodeMeta[];
  recommendations: AnimeCard[];
  trailer?: { id: string; site: string } | null;
}

export interface VideoSource {
  provider: string; // gogo-by-blogger | youtube-official | vidlink | ...
  url: string; // proxied http(s) URL, "youtube:<videoId>", or "embed:<iframe url>"
  quality: string; // auto | 1080p | official | trailer ...
  isM3U8: boolean;
  /** Human-readable origin note (e.g. "Official full episode · Muse Asia") */
  note?: string;
}

export interface OfficialLink {
  site: string;
  url: string;
}

export interface StreamsPayload {
  ok: boolean;
  /** Ordered fallback chain — player tries each in sequence */
  sources: VideoSource[];
  providersTried: { provider: string; ok: boolean; error?: string }[];
  episodeTitle?: string;
  /** MALSync-derived official streaming destinations (Crunchyroll, Hulu, …) */
  officialLinks?: OfficialLink[];
}

export interface HealthPayload {
  ok: boolean;
  services: Record<'anilist' | 'kitsu' | 'anizip' | 'gogo' | 'relay', boolean>;
  checkedAt: number;
}

export interface HistoryEntry {
  anime: AnimeCard;
  episode: { number: number; title?: string };
  /** Seconds watched */
  progress: number;
  /** Episode length in seconds (0 if unknown) */
  durationSec: number;
  updatedAt: number;
}

// ── Manga / manhwa (MangaDex tier) ──────────────────────────────────────────

export interface MangaItem {
  /** MangaDex UUID */
  id: string;
  title: string;
  /** Cover URL (uploads.mangadex.org) */
  cover: string;
  description: string;
  /** ongoing | completed | hiatus | cancelled */
  status: string;
  year?: number;
  contentRating: string;
  tags: string[];
  /** Country of origin — jp = manga, kr = manhwa, cn = manhua */
  origin: 'jp' | 'kr' | 'cn' | 'other';
  lastChapter?: string;
  /** Bayesian 0-10 rating (MangaDex statistics) */
  rating?: number;
  follows?: number;
  authors?: string[];
  /** Upstream the item came from — mangadex API tier or a scrape tier */
  source?: 'mangadex' | 'mangapill' | 'mangaread';
}

export interface MangaChapter {
  id: string;
  number: string;
  title?: string;
  pages: number;
  /** unix ms — publish time */
  at: number;
  group?: string;
  /** Tier that served this chapter (fallback chapters differ from the manga's) */
  source?: 'mangadex' | 'mangapill' | 'mangaread';
}

export interface MangaHistoryEntry {
  manga: MangaItem;
  chapter: { id: string; number: string; title?: string };
  /** Page index (0-based) the reader is on */
  page: number;
  /** Total pages in that chapter */
  pages: number;
  updatedAt: number;
}

// ── Dramas (K-drama / C-drama / Asian TV — dramacool tier) ─────────────────

export interface DramaItem {
  /** dramacool slug — e.g. "queen-of-tears" (namespace prefix added by callers) */
  slug: string;
  title: string;
  cover: string;
  year?: string;
  country?: string;
  status?: string;
  /** TVSeries | Movie | Anime | Hollywood */
  type?: string;
  /** Raw upstream id (debugging only) */
  siteId?: string;
  source?: 'dramacool';
}

export interface DramaEpisode {
  /** Numeric episode — specials use decimals (16.1, 16.2) */
  number: number;
  title?: string;
  /** Watch-page key, e.g. "episode-16" or "episode-16.1" */
  epKey: string;
  durationMin?: number;
}

export interface DramaDetail {
  drama: DramaItem;
  altNames?: string[];
  description?: string;
  network?: string;
  runtime?: string;
  airsOn?: string;
  trailerUrl?: string;
  casts?: string[];
  genres?: string[];
  episodes: DramaEpisode[];
}

export interface DramaStreamsPayload {
  ok: boolean;
  /** Ordered fallback chain — same VideoSource shape as anime streams */
  sources: VideoSource[];
  providersTried: { provider: string; ok: boolean; error?: string }[];
  episodeTitle?: string;
  /** Verified Rakuten Viki match — official web link chip (their episodes are
   *  Widevine DRM'd, so it never joins the playable chain) */
  viki?: { title: string; url: string };
}

export interface DramaHistoryEntry {
  drama: DramaItem;
  episode: { number: number; title?: string };
  /** Seconds watched */
  progress: number;
  /** Episode length in seconds (0 if unknown) */
  durationSec: number;
  updatedAt: number;
}
