"""
Ajest tg-worker — stream Telegram-stored videos over HTTP with Range support.

The Next.js site treats each episode URL as a plain MP4
    https://<this-worker>/stream/<chat_id>/<msg_id>
so no Telegram logic ever touches Vercel: this tiny service resolves the
message, aligns the requested byte range to Telegram's 1 MB chunks and pipes
the file straight to the browser. Native <video> playback + seeking works on
every device, including old iPads.

Deploy (free): Render.com web service -> runtime Python ->
  build:  pip install -r requirements.txt
  start:  uvicorn app:app --host 0.0.0.0 --port $PORT
  env:    TG_API_ID, TG_API_HASH, TG_SESSION  (see README.md)

The TG_SESSION account must be able to READ the channel that stores the
videos (add the bot as an admin of your private vault channel).
"""

import os
import re
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ.get("TG_API_ID", "0") or 0)
API_HASH = os.environ.get("TG_API_HASH", "")
SESSION = os.environ.get("TG_SESSION", "")
BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "")  # optional: bots can read too

CHUNK = 1024 * 1024  # 1 MB — Telegram download offsets must align to this
MIME = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
}

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("tg-worker")

app = FastAPI()
client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)


@app.on_event("startup")
async def _start():
    if not (API_ID and API_HASH and SESSION):
        log.warning("TG_API_ID / TG_API_HASH / TG_SESSION not set — worker idle")
        return
    await client.connect()
    if BOT_TOKEN and not await client.is_user_authorized():
        await client.start(bot_token=BOT_TOKEN)
    me = await client.get_me()
    log.info("tg-worker session ready as %s", getattr(me, "username", None) or getattr(me, "id", "?"))


def _parse_ids(chat_id: str, msg_id: str):
    chat: object = int(chat_id) if re.fullmatch(r"-?\d+", chat_id) else chat_id
    return chat, int(msg_id)


async def _file_head(chat, msg_id):
    msg = await client.get_messages(chat, ids=msg_id)
    if not msg or not getattr(msg, "document", None):
        return None
    doc = msg.document
    name = ""
    for a in doc.attributes:
        fname = getattr(a, "file_name", None)
        if fname:
            name = fname
            break
    ext = os.path.splitext(name)[1].lower()
    return doc, name, MIME.get(ext, "video/mp4")


@app.get("/")
async def root():
    return JSONResponse({"ok": True, "service": "ajest-tg-worker", "hint": "/stream/{chat_id}/{msg_id}"})


@app.get("/health")
async def health():
    authorized = False
    try:
        authorized = bool(await client.is_user_authorized())
    except Exception:
        pass
    return JSONResponse({"ok": True, "connected": client.is_connected(), "authorized": authorized})


@app.head("/stream/{chat_id}/{msg_id}")
async def stream_head(chat_id: str, msg_id: str, request: Request):
    return await stream(chat_id, msg_id, request)


@app.get("/stream/{chat_id}/{msg_id}")
async def stream(chat_id: str, msg_id: str, request: Request):
    if not client.is_connected():
        return JSONResponse({"ok": False, "error": "worker session not configured"}, status_code=503)
    try:
        head = await _file_head(*_parse_ids(chat_id, msg_id))
    except Exception as e:
        return JSONResponse({"ok": False, "error": f"telegram: {e}"}, status_code=502)
    if not head:
        return JSONResponse({"ok": False, "error": "message/document not found"}, status_code=404)

    doc, name, mime = head
    size = doc.size

    # ── Range parsing (bytes=a-b, bytes=a-, bytes=-N) ────────────────────────
    start, end, status = 0, size - 1, 200
    rng = request.headers.get("range")
    if rng:
        m = re.match(r"bytes=(\d*)-(\d*)", rng.strip())
        if m:
            if m.group(1):
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else size - 1
            elif m.group(2):  # suffix form: last N bytes
                start = max(0, size - int(m.group(2)))
            status = 206
    end = min(end, size - 1)
    if start > end or start >= size:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{size}", "Accept-Ranges": "bytes"},
        )
    length = end - start + 1

    async def gen():
        # Align to Telegram's 1 MB grid, emit the tail-skip, then trim at the end
        aligned = (start // CHUNK) * CHUNK
        skip = start - aligned
        emitted = 0
        try:
            async for chunk in client.iter_download(doc, offset=aligned, request_size=CHUNK):
                if skip:
                    if len(chunk) <= skip:
                        skip -= len(chunk)
                        continue
                    chunk = chunk[skip:]
                    skip = 0
                if emitted + len(chunk) > length:
                    chunk = chunk[: length - emitted]
                if not chunk:
                    break
                emitted += len(chunk)
                yield chunk
                if emitted >= length:
                    break
        except Exception as e:  # client disconnect / telegram hiccup — let it die quietly
            log.info("stream aborted: %s", e)

    headers = {
        "Content-Range": f"bytes {start}-{end}/{size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Content-Type": mime,
        "Content-Disposition": f'inline; filename="{name}"',
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
    }
    if request.method == "HEAD":
        return Response(status_code=status, headers=headers)
    return StreamingResponse(gen(), status_code=status, headers=headers)
