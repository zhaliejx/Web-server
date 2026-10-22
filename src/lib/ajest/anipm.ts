// ── ani.pm partner embed — AniList-addressed full-episode player ────────────
// ani.pm is a partner-first streaming player: its embed player ships
// `CSP: frame-ancestors *` (embedding from any origin is intended) and its
// open metadata API (/api/partner/v1/series/{anilistId}) returns per-episode
// sub/dub availability plus ready-made embed URLs, CORS-reflecting any
// origin so browsers can query it directly.
//
// Deployment reality: ani.pm's Cloudflare filters by TLS fingerprint — Node
// (undici) handshakes get 403 "Just a moment" while real browsers and
// python-requests pass. Server-side availability checks are therefore
// impossible from our Next.js server, and also unnecessary: the embed iframe
// itself loads in the USER'S browser (real fingerprint, residential IP),
// exactly like the partner sites it was built for. So:
//   • server: blind-build the embed URL (zero network, zero latency)
//   • client: Player verifies availability via the CORS-open partner API
//     and auto-switches provider when the episode is missing
// Episode numbering on ani.pm matches AniList's per-anime numbering, which
// is the same numbering our streams route receives.
const ANIPM_EMBED = 'https://ani.pm/embed/ani';
const ANIPM_API = 'https://ani.pm/api/partner/v1/series';

/** Build the embed player URL for an AniList episode (sub or dub). */
export function aniPmEmbedUrl(anilistId: number, episode: number, audio: 'sub' | 'dub' = 'sub'): string {
  return `${ANIPM_EMBED}/${anilistId}/${episode}/${audio}`;
}

/** Open availability endpoint (CORS-open, callable from the browser). */
export function aniPmSeriesUrl(anilistId: number): string {
  return `${ANIPM_API}/${anilistId}`;
}
