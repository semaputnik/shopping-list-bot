"""Test harness: the HTTP API is the only seam.

Each test gets its own app on a fresh SQLite database file, and authenticates with
``initData`` signed by a test bot token, so sign-in runs exactly as in production.
"""

import hashlib
import hmac
import json
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from urllib.parse import urlencode

import pytest
from fastapi.testclient import TestClient

from shopping_list_bot.app import create_app
from shopping_list_bot.config import Settings

TEST_BOT_TOKEN = "123456:TEST-bot-token-not-real"


def sign_init_data(
    user: dict | None,
    *,
    bot_token: str = TEST_BOT_TOKEN,
    auth_date: int | None = None,
    start_param: str | None = None,
    extra: dict[str, str] | None = None,
) -> str:
    """Build a Telegram ``initData`` query string signed like Telegram does."""
    fields = {"auth_date": str(auth_date if auth_date is not None else int(time.time()))}
    if user is not None:
        fields["user"] = json.dumps(user, ensure_ascii=False, separators=(",", ":"))
    if start_param is not None:
        fields["start_param"] = start_param
    fields.update(extra or {})
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    settings = Settings(
        bot_token=TEST_BOT_TOKEN,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        frontend_dist=tmp_path / "no-frontend",
        _env_file=None,
    )
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def sign_in(client: TestClient) -> Callable[..., dict]:
    """Sign a user in and return {"headers": ..., "response": ...} for further calls."""

    def _sign_in(user: dict, **kwargs) -> dict:
        response = client.post("/api/auth", json={"init_data": sign_init_data(user, **kwargs)})
        assert response.status_code == 200, response.text
        return {
            "headers": {"Authorization": f"Bearer {response.json()['token']}"},
            "response": response.json(),
        }

    return _sign_in


@pytest.fixture
def add_member(tmp_path: Path) -> Callable[[int, int], None]:
    """Make a user a Member of a List directly in the database.

    Joining by Share link is another feature; Lists with several Members are set up here
    so that leave/delete can be tested through the HTTP API.
    """
    import sqlite3

    def _add(list_id: int, user_id: int) -> None:
        with sqlite3.connect(tmp_path / "test.db") as db:
            db.execute(
                "INSERT INTO list_member (list_id, user_id, joined_at)"
                " VALUES (?, ?, datetime('now'))",
                (list_id, user_id),
            )

    return _add


@pytest.fixture
def count_rows(tmp_path: Path) -> Callable[[str], int]:
    import sqlite3

    def _count(table: str) -> int:
        with sqlite3.connect(tmp_path / "test.db") as db:
            return db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]

    return _count
