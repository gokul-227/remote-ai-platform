"""
Slack incoming-webhook compatible relay -> chat.postMessage with the bot token.

GlitchTip and Uptime Kuma speak the Slack *incoming webhook* format; this repo
only has a bot token (no webhook app). The relay accepts that format on
    POST http://slack-relay:8080/<channel>      channel: critical | errors | ...
and forwards text + attachments to the channel id from SLACK_CHANNEL_<NAME>.
It listens only on the private ops network (no published port). Stdlib only.
"""

import json
import os
import time
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CHANNELS = {
    "critical": "SLACK_CHANNEL_ALERTS_CRITICAL",
    "errors": "SLACK_CHANNEL_ALERTS_ERRORS",
    "deploys": "SLACK_CHANNEL_DEPLOYS",
    "backups": "SLACK_CHANNEL_BACKUPS",
    "job_imports": "SLACK_CHANNEL_JOB_IMPORTS",
    "signups": "SLACK_CHANNEL_SIGNUPS",
    "security": "SLACK_CHANNEL_SECURITY",
    "costs": "SLACK_CHANNEL_COSTS",
}
MAX_PER_MINUTE = int(os.environ.get("SLACK_MAX_PER_MINUTE", "30"))
_sent: deque[float] = deque()


def forward(channel_id: str, body: dict) -> bool:
    now = time.monotonic()
    while _sent and _sent[0] < now - 60:
        _sent.popleft()
    if len(_sent) >= MAX_PER_MINUTE:
        return False
    _sent.append(now)
    msg = {
        "channel": channel_id,
        "text": str(body.get("text") or "alert")[:3000],
        "unfurl_links": False,
    }
    if isinstance(body.get("attachments"), list):
        msg["attachments"] = body["attachments"][:5]
    if isinstance(body.get("blocks"), list):
        msg["blocks"] = body["blocks"][:20]
    req = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=json.dumps(msg).encode(),
        headers={
            "Authorization": f"Bearer {os.environ.get('SLACK_BOT_TOKEN', '')}",
            "Content-Type": "application/json; charset=utf-8",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as res:  # noqa: S310 (fixed https URL)
        return bool(json.loads(res.read()).get("ok"))


class Handler(BaseHTTPRequestHandler):
    def _reply(self, code: int, text: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(text.encode())

    def do_GET(self) -> None:  # noqa: N802
        self._reply(200, "ok")

    def do_POST(self) -> None:  # noqa: N802
        name = self.path.strip("/").split("?")[0]
        channel_id = os.environ.get(CHANNELS.get(name, ""), "")
        if not channel_id or not os.environ.get("SLACK_BOT_TOKEN"):
            self._reply(404, "unknown channel")
            return
        try:
            length = min(int(self.headers.get("Content-Length") or 0), 256_000)
            body = json.loads(self.rfile.read(length) or b"{}")
            ok = forward(channel_id, body if isinstance(body, dict) else {})
        except Exception as exc:  # noqa: BLE001
            self._reply(502, type(exc).__name__)
            return
        self._reply(200 if ok else 429, "ok" if ok else "not sent")

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.command} {self.path.split('?')[0]} -> {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()  # noqa: S104 (private network)
