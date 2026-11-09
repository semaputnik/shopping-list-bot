"""Runtime settings, read from environment variables (prefix ``SL_``) or a ``.env`` file."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SL_", env_file=".env", extra="ignore")

    bot_token: str = ""
    # Public https URL of the Mini App (where the backend serves the frontend).
    webapp_url: str = "https://localhost:5173"
    # The bot's @username (without @); Share links are `https://t.me/<bot>?startapp=<code>`.
    bot_username: str = ""
    database_url: str = "sqlite:///./shared_lists.db"
    # Secret for signing session tokens. Falls back to a key derived from the bot token; with neither, sessions are refused.
    session_secret: str = ""
    # initData older than this is rejected.
    init_data_max_age_seconds: int = 24 * 3600
    session_ttl_seconds: int = 7 * 24 * 3600
    # Undo of «Куплено» is accepted this long after the Purchase (the client offers 5 s; the rest is
    # grace for slow networks). Later reverts are refused so History is not rewritten.
    purchase_undo_grace_seconds: int = 30
    # A check beats an uncheck by another Member made within this many seconds of it.
    check_wins_window_seconds: float = 2.0
    # `changes?since=` answers with a full snapshot when the client is further behind than this.
    changes_max_gap: int = 100
    # Versions of change log kept per List; older ones are pruned (clients then get a snapshot).
    changes_retention: int = 500
    # An SSE comment line is sent this often to keep the stream alive through proxies.
    sse_heartbeat_seconds: float = 15.0
    # Stored answers to Idempotency-Key requests are kept this long.
    idempotency_ttl_seconds: int = 24 * 3600
    # Built frontend served by the backend when the directory exists.
    frontend_dist: Path = Path("frontend/dist")
