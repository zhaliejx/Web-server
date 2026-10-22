# Ajest — Anime, Unbound

Dark-mode anime streaming web app: AniList/Kitsu catalog, hero carousel,
HLS player with a multi-tier provider chain, full SVG icons, watch history,
and an honest fallback contract (never hangs, always explains).

Use our official web-app
-
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
- **Start:** `npx next start`  ← do NOT use `node .next/standalone/server.js` (see note)
- **Env:** `DATABASE_URL=file:/opt/render/project/src/db/custom.db` (absolute path)
  - optional: `RELAY_HOSTS=https://api-ajest.onrender.com` (comma-separated)
- Free-tier disks are ephemeral — history/prefs reset on redeploy unless you attach a disk.

> ⚠️ Next.js 16.1.x bug: Turbopack builds silently omit
> `.next/standalone/server.js` (vercel/next.js#88844). Always start with
> `npx next start` — it reads the `PORT`/`HOSTNAME` env vars natively.

Works the same on any Node host (Fly, Railway, VPS, home server):
build once, run `npx next start`, set `DATABASE_URL`.

## Companion API

The scraper API (gogo/AnimePahe/Crunchyroll/AnimeKai/MangaDex providers) is a
separate Express service: see the `Api-Ajest` repo (Anime-API extended fork).
Deploy it anywhere with a stable IP, then list it in `RELAY_HOSTS`.

# Recommendations

My recommendation for the stream sources is ani.pm, you can Change it directly inside the settings on the top bar, You can disable Youtube (Official Player), Universal Player And Animekaizen Mirror

as because the current Source chain 
> gogo -> youtube -> ani.pm
is a bit scuffed as When gogo fails The youtube Source will just play any Video It came across

tested on "Solo Leveling" it play another animes trailer.

# Credits
This Project is made possible by the following Providers And API

Ajest is a non-commercial fan project. It hosts no video — all playback is served by the third-party providers credited below, and all metadata belongs to its respective owners.


AniList - Catalog, titles & artwork
Kitsu -Mirror catalog & fallback data
ani.zip - Episode metadata & ID mappings
ani.pm - HD embed playback (sub & dub)
Gogoanime - Direct stream sources
VidLink - Universal fallback player
AnimeKaizen - Latest-episode mirror
YouTube - Official channel uploads
hls.js - Adaptive stream playback

And A big thanks for the following
Z.ai - Did most of the debugging on my buggy code and All of The commits commited on gitbub

> I had used their free Teir, on their website still works "GLM-5.3-FLASH"
