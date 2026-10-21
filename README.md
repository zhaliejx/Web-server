# Ajest — Anime, Unbound

Dark-mode anime streaming web app: AniList/Kitsu catalog, hero carousel,
HLS player with a multi-tier provider chain, full SVG icons, watch history,
and an honest fallback contract (never hangs, always explains).

## Stack

- Next.js 16 (App Router, standalone output) · React · TypeScript · Tailwind 4 · shadcn/ui
- Prisma + SQLite (watch history, likes, watch-later)
- hls.js for m3u8 playback; embedded official source via the YouTube IFrame API
- Multi-relay search assist (`RELAY_HOSTS`, raced in parallel, 6s cap)

## Stream resolution chain (per title/episode)

1. **Gogo direct** — scrapes the mirror for real episode sources (m3u8 via the built-in `/api/proxy`, which also solves CDN IP-locking on any host with a **stable egress IP**)
2. **Relay search** — races all `RELAY_HOSTS` deployments exposing `/gogoanime/search` (self-hosted fork + public relays) to find slugs the mirror misses
3. **YouTube official** — embedded official channel content as the always-available honest fallback

> Note: on hosts whose egress IP rotates (some free/sandbox platforms), tier-1
> CDN fetches can be rejected — deploy on a host with a stable outbound IP
> (Render, a VPS, or a home server) for full tier-1 playback.

## Local dev

```bash
cp .env.example .env      # DATABASE_URL only; no secrets required
npm install
npx prisma generate
npm run db:push           # creates db/custom.db
npm run dev               # http://localhost:3000
```

## Deploy (Render example)

- **Build:** `npm install && npx prisma generate && mkdir -p db && npm run build`
- **Start:** `node .next/standalone/server.js`
- **Env:** `DATABASE_URL=file:/opt/render/project/src/db/custom.db` (absolute path)
  - optional: `RELAY_HOSTS=https://api-ajest.onrender.com` (comma-separated)
- Free-tier disks are ephemeral — history/prefs reset on redeploy unless you attach a disk.

Works the same on any Node host (Fly, Railway, VPS, home server):
build once, run the standalone server, set `DATABASE_URL`.

## Companion API

The scraper API (gogo/AnimePahe/Crunchyroll/AnimeKai/MangaDex providers) is a
separate Express service: see the `Api-Ajest` repo (Anime-API extended fork).
Deploy it anywhere with a stable IP, then list it in `RELAY_HOSTS`.
