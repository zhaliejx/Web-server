# Ajest — Anime & Manga, Unbound

Dark-mode anime streaming + manga/manhwa reading web app: AniList/Kitsu catalog,
hero carousel, HLS player with a multi-tier provider chain, a four-tier manga
chain with an embedded MangaFire reader, full SVG icons, watch/reading history,
and an honest fallback contract (never hangs, always explains).

Use our official web-app
-
## Stack

- Next.js 16 (App Router, standalone output) · React · TypeScript · Tailwind 4 · shadcn/ui
- Prisma + SQLite (watch history, likes, watch-later)
- hls.js for m3u8 playback; embedded official source via the YouTube IFrame API
- Multi-relay search assist (`RELAY_HOSTS`, raced in parallel, 6s cap)

## Stream resolution chain (per title/episode)

1. **ani.pm embed** — verified full episodes (sub & dub) addressed by AniList id; availability is checked in your browser via their CORS-open partner API and a confirmed miss auto-switches to the next tier
2. **Gogo direct** — scrapes the mirror for real episode sources (m3u8 via the built-in `/api/proxy`, which also solves CDN IP-locking on any host with a **stable egress IP**); relay search assist still races alongside
3. **AnimeKaizen mirror** — Blogger-hosted latest-episode mirror, episode-matched
4. **YouTube official** — embedded official channel content as the always-available honest fallback

> Note: on hosts whose egress IP rotates (some free/sandbox platforms), tier-2
> CDN fetches can be rejected — deploy on a host with a stable outbound IP
> (Render, a VPS, or a home server) for full direct playback.

## Manga / manhwa chain

1. **MangaFire** — biggest library of the chain (licensed titles included).
   Fully client-rendered SPA behind a request-token scheme, so nothing is
   scraped server-side: instead MangaFire's own reader is **embedded via
   iframe** on every series page (and in the reader toolbar) — it opens
   pre-searched with the title, and you read with MangaFire's native UI.
2. **MangaPill** — server-scraped mirror; merges into search, covers/keywords
   relayed through `/api/manga/image`, decimal chapters supported
3. **MangaRead** — server-scraped Madara mirror with the widest
   official-title coverage (Solo Leveling, My Dress-Up Darling…)
4. **MangaDex** — rich community catalog underneath it all: home rails,
   ratings, follows; when its feed is empty or thin (licensed titles serve
   zero readable EN chapters), the gateway automatically completes the list
   from the mirrors above — with novel-edition guards so web-novel releases
   never pollute a manga's chapter list

All four are toggleable in **Settings → Manga sources**; the streaming chain is
toggleable under **Settings → Streaming sources**. Disabled tiers are never
contacted.

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

The source chains are ordered the way they are on purpose:

> Anime: **ani.pm → gogo → AnimeKaizen → YouTube**
>
> Manga/Manhwa: **MangaFire → MangaPill → MangaRead → MangaDex**

ani.pm plays first because verified AniList-addressed episodes never grab the
wrong show — the old `gogo → youtube` ordering could let the YouTube tier play
a random video (tested on "Solo Leveling": it played another anime's trailer).
You can reorder or disable any of this inside the settings on the top bar.

# Credits
This Project is made possible by the following Providers And API

Ajest is a non-commercial fan project. It hosts no video — all playback is served by the third-party providers credited below, and all metadata belongs to its respective owners.


AniList - Catalog, titles & artwork
Kitsu - Mirror catalog & fallback data
ani.zip - Episode metadata & ID mappings
ani.pm - HD embed playback (sub & dub)
Gogoanime - Direct stream sources
AnimeKaizen - Latest-episode mirror
YouTube - Official channel uploads
MangaFire - Embedded manga reader (iframe)
MangaDex - Manga catalog & reader
MangaRead - Manga mirror & chapter fallback
MangaPill - Manga mirror & chapter fallback
hls.js - Adaptive stream playback

And A big thanks for the following
Z.ai - Did most of the debugging on my buggy code and All of The commits commited on gitbub

> I had used their free Teir, on their website still works "GLM-5.3-FLASH"
