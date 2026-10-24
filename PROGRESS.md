# Ajest — Project Progress

> Anime, Unbound. A premium anime streaming web app — dark, fast, installable,
> and powered entirely by free public sources.
>
> Live: https://web-server-2dzu.onrender.com · Code: github.com/zhaliejx/Web-server

This file is the running summary of everything we have built together, newest
chapter first.

---

## Chapter 7 — My Server (self-hosted episodes) (current)

The vault chapter: Ajest can now play episodes from storage **we own** —
Telegram (unlimited, free) or any direct-MP4 host — as a first-priority
source above ani.pm/gogo, with silent failover to the regular chain when the
vault misses or is down.

- **Tier 0 source** — `/api/streams` and `/api/drama/streams` consult a
  hand-curated map (`src/lib/ajest/myserver-data.json`, pasted blocks from
  `tg-worker/upload.py`) BEFORE any upstream tier. Lookups are instant local
  matches (AniList id / titles / drama slug + episode), so an empty vault
  changes nothing.
- **tg-worker** (`tg-worker/`) — a FastAPI + Telethon service that streams
  Telegram-stored files as plain MP4 over HTTP: Range-aware 206 partials,
  1 MB chunk alignment, CORS open, `/health` for uptime pingers. Render
  free-tier deployable (`render.yaml` included).
- **upload.py** — one-command episode uploader: login once (`--login-bot`),
  then `python upload.py "file.mp4" --channel @vault --worker … --anilist 21
  --episode 1109` prints the paste-ready JSON block.
- **No Vercel bandwidth burn** — the Player streams `myserver` sources
  natively (`<video src>`, no `/api/proxy` wrapper); episodes never transit
  serverless functions. Range support keeps seeking exact on every device,
  including old iPads.
- **Verified live**: vault source served at chain position 0, native video
  mounted with the raw URL, codec-blocked sandbox correctly failed over to
  ani.pm, and a VP9 test entry achieved real playback (readyState 4,
  currentTime advancing).

---

## Chapter 6 — Old Devices & Drama Navigation

The app now survives a 2014 iPad Air 2 and the drama section got real
navigation. Fixes for "stuck in loading on my iPad" + "fix drama navigation" +
"better drama sites":

**Old-device rescue (iPad Air 2 / Safari ≤ 15.3)**
- **Syntax**: a `browserslist` (safari ≥ 12 / ios_saf ≥ 12) now forces SWC to
  transpile every modern JS construct down to old Safari — chunks audited, no
  optional chaining/nullish coalescing left.
- **Runtime APIs**: `polyfills.ts` (first import in the root layout) patches
  `globalThis`, `Promise.allSettled`, `replaceAll`, `.at()`, `Object.hasOwn`,
  `findLast`, `crypto.randomUUID`, `structuredClone` on old Safari.
- **Accent colors**: the whole alpha-tone system was `color-mix()`-only
  (Safari 16.2+) — on iPadOS 15 every tinted surface went transparent. Each
  tone now has an equivalent rgba() fallback line that old browsers keep.
- **Storage**: `safeLocalStorage` — in Safari Private Browsing, every zustand
  persist store now silently falls back to memory instead of throwing.
- **No more eternal spinner**: all client fetches are 20 s timeout-guarded,
  and an error boundary turns any render crash into an honest reload card.
- **Service worker**: cache bumped to v3; failed navigations can no longer
  cache non-HTML responses, so a stale shell can never reference deleted
  chunks again (the classic "works on desktop, bricked on iPad" bug).
- **Lite mode**: low-core/low-memory devices get `aj-lite` on <html> —
  backdrop-blur, ken-burns and hover transforms are dropped (A8X GPUs choke
  on backdrop-filter), hls.js buffers shrink.
- **Boot is 5× lighter**: the Player (+ hls.js, ~600 KB) and MangaReader moved
  to lazy chunks — the boot bundle is ~120 KB; playback chunks warm up in the
  background after mount.

**Episode playback fixes**
- **Native HLS on Apple devices** — iOS/iPadOS/macOS Safari now uses the
  device's own HLS player instead of hls.js/MSE, which fixes HEVC-variant
  episodes that used to hang in loading forever (Safari's MSE can't decode
  them; native can) and is far lighter on old hardware.
- **Dead-embed watchdog** — drama hoster/Kaizen iframes that never fire
  `load` now fail over to the next source after 14 s instead of showing a
  black frame forever.

**Drama navigation & sources**
- **Blank-screen bug fixed**: reloading the app in drama (or manga) mode used
  to render an empty main area — the view now initializes to the saved
  medium's home.
- **Drama nav completed**: Home / **Explore** / Search / **My Dramas**
  (continue-watching library with resume + remove).
- **Drama Explore** — the drama twin of anime Browse: country / genre /
  status chips + sort (most popular / recently updated / top rated), 30 per
  page with real pagination via the dramacool `/explore` endpoint
  (new `/api/drama/explore` route). Home gained a "Browse by Country" strip
  (K-Drama, C-Drama, J-Drama, Lakorn…) and every rail has a See-all.
- **Sources**: a third mirror (`dramacool.rest`) joined the dramacool9
  failover chain.

---

## Chapter 5 — Manga, Manhwa & Manhua Mode

Ajest is no longer anime-only. A new SVG **Anime ⇄ Manga switch** (TV icon /
open-book icon, top bar on every screen) flips the entire app between its two
libraries. The choice persists per device.

**Powered by MangaDex** — free public API, English releases, non-adult only:

- **Manga home** — rails for Trending, Popular Manhwa (Korean), Manhua
  (Chinese), Action, Romance, Fantasy, Fresh Updates and New Releases, plus a
  local **Continue Reading** rail with per-page progress.
- **Search** — debounced MangaDex title search with poster grid.
- **Series page** — cover hero, authors, community rating, follows, tags,
  status, and the full English chapter list (newest first, read-state ticks,
  50-at-a-time expansion). Like / Save buttons with their own libraries.
- **Reader** — full-screen vertical-scroll reader that handles both manhwa
  longstrips and paged manga: page tracker, keyboard nav (Esc, ←/→),
  prev/next chapter, end-of-chapter panel, and reading progress saved
  page-by-page to the device.
- **My Manga shelf** — Continue Reading + Saved in one view.

Five new API routes (`/api/manga/*`) proxy and cache MangaDex with rate-limit
discipline; licensed titles that only offer off-site chapters are detected and
surface an honest "No English chapters yet" state instead of a dead reader.

---

## Chapter 4 — The Great UI Overhaul

The app worked; now it *feels* right. One focused pass on layout, polish and
the three most annoying bugs:

**Bugs squashed**
- **Stuck pills** — the title + source pills on the player stayed on forever
  whenever playback came from an embedded source (vidlink / ani.pm / kaizen).
  Root cause: the auto-hide timer asked "is the video paused?" and for embeds
  the answer was always *yes* (there is no `<video>` element to ask). The
  chrome now understands embedded sources and hides on schedule.
- **The whole screen was clickable** — taps flashed blue and sometimes
  navigated. Cause: selectable overlay text + invisible-but-active controls
  capturing taps (`-webkit-tap-highlight-color` + text selection). The player
  shell is now tap-transparent (`select-none`, no tap highlight), the official
  YouTube embed sits behind a tap shield so the upstream player's own UI can
  never appear, and VidLink embeds get thin "wake strips" so the middle of the
  screen stays fully interactive for the real video controls.
- **Icons** — every glyph is now hand-authored inline SVG (nav, player
  controls, settings, badges, loaders). No icon fonts, no PNGs, nothing that
  can fail to load, and every icon inherits the active theme color.

**Layout & branding**
- App shell reformatted: content-first home (hero → continue watching →
  rails) with no boot gate, a cleaner icon sidebar + mobile bottom nav, and
  no stray footer text — the interface is the product.
- New logo: a gradient tile with a play glyph + broadcast spark, drawn in SVG
  and recolored live by the active theme. Favicon, PWA icon, maskable icon and
  manifest all updated to match.
- Bootup/splash screen deleted — the catalog starts loading immediately.

**Themes**
- 8 accent themes in Settings: **Ember (black + orange, the default and
  identity)**, Crimson, Violet, Azure, Mint, Rose, Gold, Platinum. One accent
  variable (`--aj-acc`) drives the entire app — logo, buttons, rails,
  progress bars, everything — and the choice persists on your device.

**Credits & settings**
- The Settings modal (gear in the top bar) now holds three sections: Theme,
  Streaming Sources (every provider toggleable, persisted, skipped instantly
  when off) and a proper **Credits** wall — AniList, Kitsu, ani.zip, ani.pm,
  Gogoanime, VidLink, AnimeKaizen, YouTube and hls.js — plus a fan-project
  disclaimer. Ajest hosts no video; all playback belongs to the credited
  providers.

---

## Chapter 3 — Playing Everything

- **ani.pm tier** — the best source in the project: verified full episodes
  (sub & dub) addressed directly by AniList ID, checked in *your browser*
  before it plays, with automatic failover when an episode is missing.
- **VidLink universal tier** — covers effectively the entire catalog through
  TMDB mapping, so "I want to watch everything" became literally true.
- **AnimeKaizen mirror tier** — latest-episode fallback with episode matching.
- **gogo direct streams** — real `.m3u8` files with Ajest's own player:
  progress saving, resume, auto-next. Unlocked on stable-IP deployments via
  the built-in proxy.
- **Official uploads** — full episodes from official channels (Muse Asia,
  Crunchyroll…) where available.
- Resolution runs all enabled providers **in parallel with fast-exit** —
  2.9–5.2× faster than the old sequential chain.

## Chapter 2 — Deployment & Infrastructure

- App lives at **zhaliejx/Web-server**, deployed on Render
  (`npx next start` — a one-field fix for a Next 16 Turbopack regression).
- Relay-search chain across the user's own Anime-API fork deployments
  (Render + Vercel) plus community relays, with rate-limit hardening and an
  external keep-alive cron.
- Optional FlareSolverr tier wired in (one env var to activate) for
  Cloudflare-protected upstreams.

## Chapter 1 — Foundation

- Next.js 16 standalone app: hero carousel, rails, detail pages with exact
  episode metadata, simulcast schedule with live countdowns, search,
  personal library (history / liked / watch later) — all persisted locally.
- Triple-fallback catalog (AniList → Kitsu → gogo directory) so a single
  upstream outage never blanks the app.
- 100% hand-drawn SVG icon system, PWA install, fullscreen mode, offline
  shell via service worker.

---

## The Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (Turbopack, standalone) |
| Playback | hls.js + provider chain (gogo → youtube → ani.pm → vidlink → kaizen) |
| Metadata | AniList, Kitsu, ani.zip, MALSync |
| UI | Tailwind CSS 4, hand-authored SVG icons, themeable accent system |
| Persistence | localStorage (library, source prefs, theme) |

*Ajest is a non-commercial fan project. It hosts no video — all playback is
served by third-party providers, and all metadata belongs to its respective
owners.*
