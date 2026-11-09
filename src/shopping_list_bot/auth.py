"""Telegram initData verification and signed session tokens."""

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl


class AuthError(Exception):
    pass


@dataclass(frozen=True)
class TelegramUser:
    id: int
    first_name: str
    last_name: str | None
    username: str | None
    photo_url: str | None
    language_code: str | None


@dataclass(frozen=True)
class VerifiedInitData:
    user: TelegramUser
    auth_date: int
    start_param: str | None


def verify_init_data(
    init_data: str, bot_token: str, *, max_age_seconds: int, now: float | None = None
) -> VerifiedInitData:
    """Verify raw ``initData`` (HMAC-SHA256 keyed by the bot token, plus ``auth_date`` freshness)."""
    if not bot_token:
        raise AuthError("bot token not configured")
    try:
        pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    except ValueError as exc:
        raise AuthError("malformed initData") from exc
    fields = dict(pairs)
    received_hash = fields.pop("hash", None)
    if not received_hash:
        raise AuthError("missing hash")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        raise AuthError("bad signature")

    try:
        auth_date = int(fields["auth_date"])
    except (KeyError, ValueError) as exc:
        raise AuthError("missing auth_date") from exc
    current = time.time() if now is None else now
    if current - auth_date > max_age_seconds:
        raise AuthError("initData expired")
    if auth_date - current > 300:  # clock skew allowance
        raise AuthError("auth_date in the future")

    try:
        raw = json.loads(fields["user"])
        user = TelegramUser(
            id=int(raw["id"]),
            first_name=str(raw.get("first_name") or raw.get("username") or ""),
            last_name=raw.get("last_name"),
            username=raw.get("username"),
            photo_url=raw.get("photo_url"),
            language_code=raw.get("language_code"),
        )
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise AuthError("missing user") from exc
    return VerifiedInitData(user=user, auth_date=auth_date, start_param=fields.get("start_param"))


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _sign(secret: str, payload: str) -> str:
    return _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())


def issue_session_token(
    user_id: int, secret: str, ttl_seconds: int, now: float | None = None
) -> tuple[str, int]:
    expires_at = int((time.time() if now is None else now) + ttl_seconds)
    payload = f"{user_id}.{expires_at}"
    return f"{payload}.{_sign(secret, payload)}", expires_at


def read_session_token(token: str, secret: str, now: float | None = None) -> int:
    """Return the user id from a valid, unexpired token, or raise ``AuthError``."""
    try:
        user_id, expires_at, signature = token.split(".")
        if not hmac.compare_digest(_sign(secret, f"{user_id}.{expires_at}"), signature):
            raise AuthError("bad token")
        if int(expires_at) < (time.time() if now is None else now):
            raise AuthError("token expired")
        return int(user_id)
    except ValueError as exc:
        raise AuthError("bad token") from exc
