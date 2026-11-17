"""Test harness: the HTTP API is the only seam.

Each test gets its own app on a fresh Postgres database, and authenticates with
``initData`` signed by a test bot token, so sign-in runs exactly as in production.

Postgres comes from a testcontainers ``postgres:18`` container, or, when ``SL_TEST_POSTGRES_URL``
is set (CI), from that server. The schema is migrated once into a template database; every test
then gets a copy of it.
"""

import hashlib
import hmac
import json
import os
import time
import uuid
from collections.abc import Callable, Iterator
from pathlib import Path
from urllib.parse import urlencode

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import OperationalError
from testcontainers.community.postgres import PostgresContainer

from shopping_list_bot.app import create_app
from shopping_list_bot.config import Settings
from shopping_list_bot.migrate import upgrade

# No test ever talks to Telegram: the background notification sender stays off unless a test
# builds its own app with a fake sender (see tests/test_notifications.py).
os.environ.setdefault("SL_NOTIFY_POLL_SECONDS", "0")
# The container is stopped by the fixture's ``with``; the Ryuk reaper sidecar is not needed and
# cannot reach its port on Colima.
os.environ.setdefault("TESTCONTAINERS_RYUK_DISABLED", "true")

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


def _render(url: URL) -> str:
    return url.render_as_string(hide_password=False)


def _wait_until_reachable(url: URL, timeout: float = 30.0) -> None:
    """The container logs "ready" before its forwarded port always accepts connections."""
    engine = create_engine(url)
    deadline = time.monotonic() + timeout
    while True:
        try:
            with engine.connect():
                break
        except OperationalError:
            if time.monotonic() > deadline:
                raise
            time.sleep(0.5)
    engine.dispose()


@pytest.fixture(scope="session")
def postgres_url() -> Iterator[URL]:
    """Server-level URL of the Postgres the suite runs on."""
    external = os.environ.get("SL_TEST_POSTGRES_URL")
    if external:
        yield make_url(external)
        return
    with PostgresContainer("postgres:18", driver="psycopg") as container:
        url = make_url(container.get_connection_url())
        _wait_until_reachable(url)
        yield url


def _admin(postgres_url: URL):
    return create_engine(postgres_url, isolation_level="AUTOCOMMIT")


@pytest.fixture(scope="session")
def template_database(postgres_url: URL) -> Iterator[str]:
    name = f"sl_template_{uuid.uuid4().hex[:8]}"
    admin = _admin(postgres_url)
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    upgrade(_render(postgres_url.set(database=name)))
    yield name
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
    admin.dispose()


def _fresh_database(postgres_url: URL, template: str | None) -> Iterator[str]:
    name = f"sl_test_{uuid.uuid4().hex[:12]}"
    admin = _admin(postgres_url)
    with admin.connect() as conn:
        conn.execute(
            text(f'CREATE DATABASE "{name}"' + (f' TEMPLATE "{template}"' if template else ""))
        )
    yield _render(postgres_url.set(database=name))
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
    admin.dispose()


@pytest.fixture
def database_url(postgres_url: URL, template_database: str) -> Iterator[str]:
    """A fresh, migrated database for one test."""
    yield from _fresh_database(postgres_url, template_database)


@pytest.fixture
def blank_database_url(postgres_url: URL) -> Iterator[str]:
    """A fresh database with no tables, for tests of the migration step itself."""
    yield from _fresh_database(postgres_url, None)


@pytest.fixture
def settings_overrides() -> dict:
    """Override per test with ``@pytest.mark.parametrize("settings_overrides", [{...}])``."""
    return {}


@pytest.fixture
def client(tmp_path: Path, database_url: str, settings_overrides: dict) -> Iterator[TestClient]:
    settings = Settings(
        bot_token=TEST_BOT_TOKEN,
        bot_username="shared_lists_test_bot",
        database_url=database_url,
        frontend_dist=tmp_path / "no-frontend",
        _env_file=None,
        **settings_overrides,
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


def invite_code(client, session: dict, list_id: int) -> str:
    """The code of the session's own Invite to the List (created on first request)."""
    response = client.get(f"/api/lists/{list_id}/invite", headers=session["headers"])
    assert response.status_code == 200, response.text
    return response.json()["code"]


@pytest.fixture
def add_member(client: TestClient) -> Callable[[dict, dict, dict], dict]:
    """Make a signed-in user a Member of a List by opening an existing Member's Invite link."""

    def _add(lst: dict, session: dict, inviter: dict) -> dict:
        code = invite_code(client, inviter, lst["id"])
        response = client.post("/api/lists/join", json={"code": code}, headers=session["headers"])
        assert response.status_code == 200, response.text
        return response.json()

    return _add


@pytest.fixture
def count_rows(database_url: str) -> Iterator[Callable[[str], int]]:
    engine = create_engine(database_url)

    def _count(table: str) -> int:
        with engine.connect() as conn:
            return conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()

    yield _count
    engine.dispose()
