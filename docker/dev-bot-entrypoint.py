"""Dev-only bot entrypoint: take the Mini App URL from ngrok, then run the bot.

Order of precedence: SL_WEBAPP_URL if set, NGROK_URL if set, otherwise the public https tunnel
reported by the ngrok inspector API (NGROK_API). Used by docker-compose.dev.yml.
"""

import json
import os
import sys
import time
import urllib.request


def ngrok_https_url(api: str, timeout_s: float = 60.0) -> str:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(api, timeout=2) as resp:
                tunnels = json.load(resp).get("tunnels", [])
            for tunnel in tunnels:
                url = tunnel.get("public_url", "")
                if url.startswith("https://"):
                    return url
        except OSError:
            pass
        time.sleep(1)
    raise SystemExit(f"no https tunnel reported by {api} within {timeout_s:.0f}s")


def main() -> None:
    url = os.environ.get("SL_WEBAPP_URL") or os.environ.get("NGROK_URL")
    if not url:
        url = ngrok_https_url(os.environ.get("NGROK_API", "http://ngrok:4040/api/tunnels"))
    os.environ["SL_WEBAPP_URL"] = url.rstrip("/")
    print(f"Mini App URL: {os.environ['SL_WEBAPP_URL']}", flush=True)
    sys.stdout.flush()
    os.execvp("shopping-list-bot", ["shopping-list-bot", "bot"])


if __name__ == "__main__":
    main()
