# My Server — self-hosted episodes on Telegram (1TB+, free, ad-free)

Episodes you upload to a private Telegram channel are streamed by this tiny
worker and play in Ajest as a **first-priority "My server" source** — above
ani.pm/gogo/kaizen. If the worker or a file is unavailable, the player
automatically falls back to the regular chain. Nothing about the site breaks
when the vault is empty.

```
upload.py ──▶ private Telegram channel (your vault, ~unlimited storage)
                   │
tg-worker (Render, free) ──▶ /stream/{chat}/{msg} = plain MP4 with Range
                   │
myserver-data.json ──▶ /api/streams tier 0 ──▶ Player <video> (no proxy)
```

## One-time setup (~10 minutes)

1. **Create the bot** — open Telegram → [@BotFather](https://t.me/BotFather)
   → `/newbot` → save the token (`123456:ABC-DEF…`).
2. **API credentials** — log in at [my.telegram.org](https://my.telegram.org)
   → *API development tools* → note `api_id` + `api_hash`.
3. **Log the uploader in** (once, on your computer):
   ```
   cd tg-worker
   pip install telethon
   python upload.py --login-bot 123456:ABC-DEF…
   ```
   It prints a long string — that is your **TG_SESSION**.
4. **Create the vault** — Telegram → New Channel → **private** (e.g.
   `@ajest_vault`). Add your bot as an **admin** (post messages permission is
   enough).
5. **Deploy the worker** — [render.com](https://render.com) → New → Web
   Service → point it at this repo, root directory `tg-worker`. Render reads
   `render.yaml`. Set the env vars:
   - `TG_API_ID` / `TG_API_HASH` — from step 2
   - `TG_SESSION` — the string from step 3
   Free plan is fine (spins down after idle; first play may take ~30 s to
   wake, then falls within our player's timeout — a free uptime pinger like
   cron-job.org hitting `/health` every 10 min keeps it warm).

## Adding an episode

```
python upload.py "One Piece - S01E1109.mp4" \
    --channel @ajest_vault \
    --worker https://ajest-tg-worker.onrender.com \
    --kind anime --anilist 21 --episode 1109 \
    --titles "One Piece|ワンピース" --note "1080p sub"
```

- `--anilist` — the number in the AniList URL (`anilist.co/anime/21/…`). Best
  matching key; titles work as a fallback.
- Dramas: `--kind drama --slug queen-of-tears --episode 16` (decimals like
  `16.1` are fine). The slug is the dramacool slug, visible in the site URL.
- The command prints a JSON block → paste it into
  `src/lib/ajest/myserver-data.json` → `items` → commit + push. Vercel
  redeploys, the episode now plays first in the chain.

## No Telegram? Archive.org works too

`url` in the map accepts ANY direct MP4 with Range support. Upload to
[archive.org](https://archive.org), copy the item's MP4 link
(`https://archive.org/download/<item>/<file>.mp4`) and paste the same JSON
block with that URL. No worker, no session — zero infra.

## Rules of thumb

- Name files clearly (`Anime - SxxEyy.mp4`) — the name becomes the download
  filename players show.
- Keep filenames bland; never list the channel publicly. Private channel +
  admin-only bot = effectively unlisted.
- The vault is a delivery copy, not your backup — keep originals elsewhere.
- Render free gives you plenty for streaming, but if it ever feels slow:
  Koyeb free tier or an Oracle Cloud free VPS run the same worker unchanged.

## Endpoints

| Route | What |
|---|---|
| `GET /stream/{chat_id}/{msg_id}` | The video (Range-aware, 206 partials, CORS open) |
| `HEAD /stream/{chat_id}/{msg_id}` | Same, headers only |
| `GET /health` | `{ok, connected, authorized}` — for uptime pingers |
