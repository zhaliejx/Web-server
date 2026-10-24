#!/usr/bin/env python3
"""
Ajest vault uploader — push episode files to your private Telegram channel
and print paste-ready JSON blocks for src/lib/ajest/myserver-data.json.

One-time login (creates a local session, saved to .sessions/uploader):
  python upload.py --login-bot 123456:ABC-DEF...   # bot account (recommended)
  python upload.py --login-user +639XXXXXXXXX      # your own account

Upload an episode:
  python upload.py "One Piece - S01E1109.mp4" \
      --channel @ajest_vault \
      --worker https://ajest-tg-worker.onrender.com \
      --kind anime --anilist 21 --episode 1109 \
      --titles "One Piece" --note "1080p sub"

For a drama:  --kind drama --slug queen-of-tears --episode 16
Decimals ok:  --episode 16.1

Print the JSON block, paste it into the `items` array in
src/lib/ajest/myserver-data.json, commit + push — done.
"""

import argparse
import asyncio
import json
import os
import sys

from telethon import TelegramClient
from telethon.sessions import StringSession

HERE = os.path.dirname(os.path.abspath(__file__))
SESSION_DIR = os.path.join(HERE, ".sessions")
CREDS = os.path.join(SESSION_DIR, "creds.json")


def load_creds():
    if os.path.exists(CREDS):
        with open(CREDS) as f:
            return json.load(f)
    return {}


def save_creds(c):
    os.makedirs(SESSION_DIR, exist_ok=True)
    with open(CREDS, "w") as f:
        json.dump(c, f, indent=2)


def progress(cur, total):
    pct = int(cur * 50 / total) if total else 0
    sys.stdout.write(f"\r  [{'#' * pct}{'.' * (50 - pct)}] {cur / 1e6:.1f}/{total / 1e6:.1f} MB")
    sys.stdout.flush()


async def do_login(args):
    creds = load_creds()
    api_id = args.api_id or creds.get("api_id") or int(input("api_id (my.telegram.org): ").strip())
    api_hash = args.api_hash or creds.get("api_hash") or input("api_hash: ").strip()
    save_creds({"api_id": int(api_id), "api_hash": api_hash})
    os.makedirs(SESSION_DIR, exist_ok=True)

    if args.login_bot:
        client = TelegramClient(os.path.join(SESSION_DIR, "uploader"), int(api_id), api_hash)
        await client.start(bot_token=args.login_bot)
    elif args.login_user:
        client = TelegramClient(os.path.join(SESSION_DIR, "uploader"), int(api_id), api_hash)
        await client.start(phone=args.login_user)
    else:
        print("nothing to log into")
        return

    s = StringSession.save(client.session)
    await client.disconnect()
    print("\n✅ Session saved locally (.sessions/uploader).")
    print("\nAlso set this on your RENDER worker as TG_SESSION (Service > Environment):")
    print(f"\n{s}\n")


async def do_upload(args):
    creds = load_creds()
    if not creds.get("api_id"):
        sys.exit("No stored credentials — run a --login-* command first.")
    if not os.path.isfile(args.file):
        sys.exit(f"file not found: {args.file}")
    if not args.worker:
        sys.exit("--worker https://<your-tg-worker>.onrender.com is required")

    client = TelegramClient(os.path.join(SESSION_DIR, "uploader"), int(creds["api_id"]), creds["api_hash"])
    await client.start(bot_token=args.bot_token) if args.bot_token else await client.connect()
    if not await client.is_user_authorized():
        sys.exit("Session not authorized — re-run the --login flow.")

    chat = await client.get_entity(args.channel)
    print(f"Uploading {args.file} → {getattr(chat, 'title', args.channel)} …")
    msg = await client.send_file(
        chat,
        args.file,
        caption=args.note or "",
        supports_streaming=True,
        force_document=True,  # keep the original file — stream it ourselves, no Telegram player
        progress_callback=progress,
    )
    print()
    base = args.worker.rstrip("/")
    entry = {
        "kind": args.kind,
        "episode": args.episode,
        "url": f"{base}/stream/{msg.chat_id}/{msg.id}",
        "note": args.note or None,
    }
    if args.kind == "anime":
        if args.anilist:
            entry["anilistId"] = args.anilist
        if args.titles:
            entry["titles"] = [t.strip() for t in args.titles.split("|") if t.strip()]
    else:
        entry["dramaSlug"] = args.slug

    print("✅ Uploaded. Paste this block into src/lib/ajest/myserver-data.json → items:")
    print(json.dumps(entry, ensure_ascii=False, indent=2))
    await client.disconnect()


def main():
    p = argparse.ArgumentParser(description="Upload episodes to the Telegram vault")
    p.add_argument("file", nargs="?", help="episode file to upload")
    p.add_argument("--login-bot", metavar="TOKEN", help="one-time bot login (BotFather token)")
    p.add_argument("--login-user", metavar="PHONE", help="one-time user login (+63…)")
    p.add_argument("--api-id", help="my.telegram.org api_id")
    p.add_argument("--api-hash", help="my.telegram.org api_hash")
    p.add_argument("--bot-token", help="re-auth uploader session as this bot")
    p.add_argument("--channel", default="me", help="vault channel (@name / -100… id / 'me' = Saved Messages)")
    p.add_argument("--worker", help="https://<your-tg-worker>.onrender.com")
    p.add_argument("--kind", choices=["anime", "drama"], default="anime")
    p.add_argument("--anilist", type=int, help="AniList id of the anime (from the site URL)")
    p.add_argument("--titles", help='match titles, pipe-separated: "One Piece|ワンピース"')
    p.add_argument("--slug", help="drama slug, e.g. queen-of-tears")
    p.add_argument("--episode", type=float, required=False, default=None)
    p.add_argument("--note", help='quality note, e.g. "1080p sub"')
    a = p.parse_args()

    if a.login_bot or a.login_user:
        asyncio.run(do_login(a))
    elif a.file:
        if a.episode is None:
            p.error("--episode is required for uploads")
        asyncio.run(do_upload(a))
    else:
        p.print_help()


if __name__ == "__main__":
    main()
