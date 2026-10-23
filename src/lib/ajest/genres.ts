// ── Browse filter vocabulary (shared by /api/anime/browse + BrowseView) ─────
// AniList canonical genres are queried via genre_in; themes like Isekai are
// AniList *tags* queried via tag_in. This allowlist is the single source of
// truth on both sides — user input outside it is rejected server-side, so
// browse params can never inject arbitrary GraphQL values.

export const BROWSE_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
] as const;

export const BROWSE_THEMES = [
  'Isekai',
  'Iyashikei',
  'School',
  'Time Travel',
] as const;

export type BrowseSort = 'trending' | 'popular' | 'score' | 'newest' | 'az';

export const BROWSE_SORTS: { id: BrowseSort; label: string }[] = [
  { id: 'trending', label: 'Trending' },
  { id: 'popular', label: 'Most Popular' },
  { id: 'score', label: 'Top Rated' },
  { id: 'newest', label: 'Newest' },
  { id: 'az', label: 'A → Z' },
];

/** MediaSort enum values sent to AniList for each browse sort id. */
export const ANILIST_SORTS: Record<BrowseSort, string[]> = {
  trending: ['TRENDING_DESC'],
  popular: ['POPULARITY_DESC'],
  score: ['SCORE_DESC'],
  newest: ['START_DATE_DESC'],
  az: ['TITLE_ROMAJI'],
};

export function isBrowseSort(v: string): v is BrowseSort {
  return (BROWSE_SORTS as { id: string }[]).some((s) => s.id === v);
}
