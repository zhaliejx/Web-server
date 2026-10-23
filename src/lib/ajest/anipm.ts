// ── ani.pm partner embed — AniList-addressed full-episode player ────────────
// ani.pm is a partner-first streaming player: its embed player ships
// `CSP: frame-ancestors *` (embedding from any origin is intended) and its
// open metadata API (/api/partner/v1/series/{anilistId}) returns per-episode
// sub/dub availability plus ready-made embed URLs, CORS-reflecting any
// origin so browsers can query it directly.
//
// AD/REDIRECT HARDENING (Ajest is 100% ad-free): ani.pm's embed page injects
// a click-catcher pop-under layer (embed.settlar.io/ad/pop → acscdn aclib
// runPop) that periodically goes click-through and fires an ad on the next
// tap anywhere in their document, and their frames can top-navigate. Player
// neutralizes this with a FULL interaction shield: no click ever reaches
// their document, so their frame never holds user activation — and Chrome
// blocks cross-origin top-frame navigation and pop-unders from activation-
// less frames (the pop-under is click-driven and can never arm). A sandbox
// is deliberately NOT used: their embed probes `document.domain =
// document.domain`, which Chrome forbids in ANY sandboxed frame (even with
// allow-same-origin), tripping their "can't run in a sandboxed frame"
// refusal. All playback control rides the postMessage partner API
// (ns 'anipm.player' v1): play/pause/seek/setVolume/setMuted/
// setPlaybackRate/setAutoNext commands in, timeupdate/play/pause/ended/
// volumechange/error events out.
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
