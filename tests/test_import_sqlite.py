"""``import-sqlite``: the live MVP database (SQLite) is carried over into an empty Postgres.

The source is a SQLite file with the MVP schema; the result is checked through the HTTP API,
the same way the app reads it.
"""

import asyncio
import sqlite3
import sys
from datetime import timedelta

import pytest
from conftest import TEST_BOT_TOKEN, sign_init_data
from fastapi.testclient import TestClient

from shopping_list_bot import main
from shopping_list_bot.app import create_app
from shopping_list_bot.config import Settings
from shopping_list_bot.models import utcnow

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
BORIS = {"id": 1002, "first_name": "Борис", "language_code": "ru"}

# The MVP schema as `create_all` plus `_add_missing_columns` left it: naive DATETIMEs, 0/1
# booleans, notification.items as TEXT, and no CHECKs or BIGINT keys.
MVP_SCHEMA = """
CREATE TABLE "user" (
    id INTEGER PRIMARY KEY, telegram_id BIGINT NOT NULL UNIQUE, first_name VARCHAR(256) NOT NULL,
    last_name VARCHAR(256), username VARCHAR(64), photo_url VARCHAR(1024),
    language_code VARCHAR(16), language VARCHAR(8), created_at DATETIME NOT NULL);
CREATE TABLE list (
    id INTEGER PRIMARY KEY, name VARCHAR(200) NOT NULL, name_is_default BOOLEAN NOT NULL DEFAULT 0,
    share_code VARCHAR(64) NOT NULL UNIQUE, created_by INTEGER REFERENCES "user" (id),
    created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, version INTEGER NOT NULL);
CREATE TABLE list_member (
    id INTEGER PRIMARY KEY, list_id INTEGER NOT NULL REFERENCES list (id),
    user_id INTEGER NOT NULL REFERENCES "user" (id), joined_at DATETIME NOT NULL,
    UNIQUE (list_id, user_id));
CREATE TABLE product (
    id INTEGER PRIMARY KEY, list_id INTEGER NOT NULL REFERENCES list (id),
    name VARCHAR(200) NOT NULL, name_norm VARCHAR(200) NOT NULL, category_key VARCHAR(32) NOT NULL,
    purchase_count INTEGER NOT NULL DEFAULT 0, hidden BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL, last_purchased_at DATETIME, UNIQUE (list_id, name_norm));
CREATE TABLE entry (
    id INTEGER PRIMARY KEY, list_id INTEGER NOT NULL REFERENCES list (id),
    product_id INTEGER NOT NULL REFERENCES product (id), name VARCHAR(200) NOT NULL,
    note VARCHAR(500), added_by INTEGER REFERENCES "user" (id), created_at DATETIME NOT NULL,
    client_id VARCHAR(80), deleted_at DATETIME, checked_at DATETIME,
    checked_by INTEGER REFERENCES "user" (id), UNIQUE (list_id, client_id));
CREATE TABLE purchase (
    id INTEGER PRIMARY KEY, list_id INTEGER NOT NULL REFERENCES list (id),
    purchased_at DATETIME NOT NULL, purchased_by INTEGER REFERENCES "user" (id));
CREATE TABLE purchase_entry (
    id INTEGER PRIMARY KEY, purchase_id INTEGER NOT NULL REFERENCES purchase (id),
    product_id INTEGER NOT NULL REFERENCES product (id), name VARCHAR(200) NOT NULL,
    note VARCHAR(500), added_by INTEGER REFERENCES "user" (id),
    entry_created_at DATETIME NOT NULL, checked_at DATETIME NOT NULL,
    checked_by INTEGER REFERENCES "user" (id));
CREATE TABLE list_change (
    id INTEGER PRIMARY KEY, list_id INTEGER NOT NULL, version INTEGER NOT NULL,
    kind VARCHAR(32) NOT NULL, entry_id INTEGER, created_at DATETIME NOT NULL,
    UNIQUE (list_id, version));
CREATE TABLE idempotency_record (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES "user" (id),
    key VARCHAR(80) NOT NULL, method VARCHAR(8) NOT NULL, path VARCHAR(300) NOT NULL,
    body_hash VARCHAR(64) NOT NULL, status_code INTEGER NOT NULL, body TEXT NOT NULL,
    content_type VARCHAR(100), created_at DATETIME NOT NULL, UNIQUE (user_id, key));
CREATE TABLE notification (
    id INTEGER PRIMARY KEY, list_id INTEGER NOT NULL REFERENCES list (id),
    actor_id INTEGER NOT NULL REFERENCES "user" (id), kind VARCHAR(16) NOT NULL,
    purchase_id INTEGER REFERENCES purchase (id), items TEXT NOT NULL,
    first_at DATETIME NOT NULL, due_at DATETIME NOT NULL);
"""

# Ids are deliberately not 1..n: they must survive the import, and new rows must land after them.
MVP_DATA = """
INSERT INTO "user" (id, telegram_id, first_name, created_at) VALUES
    (3, 1001, 'Анна', '2026-03-01 09:00:00.000000'), (8, 1002, 'Борис', '2026-03-02 09:00:00.000000');
INSERT INTO list (id, name, name_is_default, share_code, created_by, created_at, updated_at, version)
    VALUES (5, 'Покупки', 1, 'code5', 3, '2026-03-01 09:00:00.000000',
            '2026-03-05 18:30:00.000000', 7);
INSERT INTO list_member (id, list_id, user_id, joined_at) VALUES
    (1, 5, 3, '2026-03-01 09:00:00.000000'), (2, 5, 8, '2026-03-02 09:05:00.000000');
INSERT INTO product (id, list_id, name, name_norm, category_key, purchase_count, hidden,
                     created_at, last_purchased_at) VALUES
    (10, 5, 'молоко', 'молоко', 'dairy', 1, 0, '2026-03-03 10:00:00.000000',
     '2026-03-05 18:00:00.000000'),
    (11, 5, 'хлеб', 'хлеб', 'bread', 0, 0, '2026-03-03 10:00:00.000000', NULL),
    (12, 5, 'соль', 'соль', 'other', 0, 1, '2026-03-03 10:00:00.000000', NULL);
INSERT INTO entry (id, list_id, product_id, name, note, added_by, created_at, client_id,
                   deleted_at) VALUES
    (20, 5, 10, 'молоко', '2 л', 3, '2026-03-05 17:00:00.000000', 'c-20', NULL),
    (21, 5, 11, 'хлеб', NULL, 8, '2026-03-05 17:01:00.000000', 'c-21',
     '2026-03-05 17:30:00.000000');
INSERT INTO purchase (id, list_id, purchased_at, purchased_by) VALUES
    (30, 5, '2026-03-05 18:00:00.000000', 3);
INSERT INTO purchase_entry (id, purchase_id, product_id, name, note, added_by,
                            entry_created_at, checked_at, checked_by) VALUES
    (40, 30, 10, 'молоко', NULL, 3, '2026-03-04 09:00:00.000000', '2026-03-05 17:55:00.000000', 8);
INSERT INTO list_change (id, list_id, version, kind, entry_id, created_at) VALUES
    (60, 5, 7, 'purchase.created', NULL, '2026-03-05 18:00:00.000000');
INSERT INTO notification (id, list_id, actor_id, kind, purchase_id, items, first_at, due_at) VALUES
    (50, 5, 3, 'added', NULL, '[[20, "молоко"]]', '2026-03-05 17:00:00.000000',
     '2026-03-05 17:03:00.000000'),
    (51, 5, 3, 'bought', 30, '["молоко"]', '2026-03-05 18:00:00.000000',
     '2026-03-05 18:00:30.000000');
"""


@pytest.fixture
def mvp_sqlite(tmp_path):
    path = tmp_path / "shared_lists.db"
    conn = sqlite3.connect(path)
    conn.executescript(MVP_SCHEMA + MVP_DATA)
    conn.close()
    return path


class Harness:
    def __init__(self, tmp_path, database_url):
        self.sent = []

        async def send(message):
            self.sent.append(message)

        self.app = create_app(
            Settings(
                bot_token=TEST_BOT_TOKEN,
                bot_username="shared_lists_test_bot",
                database_url=database_url,
                frontend_dist=tmp_path / "no-frontend",
                _env_file=None,
            ),
            notify_send=send,
        )
        self.client = TestClient(self.app)

    def sign_in(self, user):
        response = self.client.post("/api/auth", json={"init_data": sign_init_data(user)})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture
def app(tmp_path, database_url):
    harness = Harness(tmp_path, database_url)
    with harness.client:
        yield harness


def run_import(monkeypatch, path, database_url):
    monkeypatch.setenv("SL_DATABASE_URL", database_url)
    monkeypatch.setattr(sys, "argv", ["shopping-list-bot", "import-sqlite", str(path)])
    main()


def contents(client, headers, list_id):
    r = client.get(f"/api/lists/{list_id}/entries", headers=headers)
    assert r.status_code == 200, r.text
    return [e for group in r.json()["categories"] for e in group["entries"]]


def test_lists_members_entries_and_history_arrive_with_their_ids(
    mvp_sqlite, database_url, monkeypatch, tmp_path
):
    run_import(monkeypatch, mvp_sqlite, database_url)

    with TestClient(
        create_app(
            Settings(
                bot_token=TEST_BOT_TOKEN,
                database_url=database_url,
                frontend_dist=tmp_path / "no-frontend",
                _env_file=None,
            )
        )
    ) as client:
        r = client.post("/api/auth", json={"init_data": sign_init_data(ANNA)})
        headers = {"Authorization": f"Bearer {r.json()['token']}"}

        lists = client.get("/api/lists", headers=headers).json()
        assert [(lst["id"], lst["name"], lst["share_code"]) for lst in lists] == [
            (5, "Покупки", "code5")
        ]
        assert [(e["id"], e["name"], e["note"]) for e in contents(client, headers, 5)] == [
            (20, "молоко", "2 л")
        ]
        members = client.get("/api/lists/5", headers=headers).json()["members"]
        assert sorted(m["first_name"] for m in members) == ["Анна", "Борис"]

        history = client.get("/api/lists/5/purchases", headers=headers).json()
        (purchase,) = history["purchases"]
        assert purchase["id"] == 30
        # The naive SQLite time is UTC: the API shows the same instant, with an offset.
        assert purchase["purchased_at"].startswith("2026-03-05T18:00:00")
        assert purchase["purchased_at"].endswith(("Z", "+00:00"))
        assert [e["name"] for e in purchase["entries"]] == ["молоко"]


def test_a_deleted_entry_stays_deleted_and_restorable(mvp_sqlite, database_url, monkeypatch, app):
    run_import(monkeypatch, mvp_sqlite, database_url)
    headers = app.sign_in(ANNA)

    assert [e["id"] for e in contents(app.client, headers, 5)] == [20]
    restored = app.client.post("/api/lists/5/entries/21/restore", headers=headers)
    assert restored.status_code == 200, restored.text
    assert sorted(e["id"] for e in contents(app.client, headers, 5)) == [20, 21]


def test_new_rows_get_ids_after_the_imported_ones(mvp_sqlite, database_url, monkeypatch, app):
    run_import(monkeypatch, mvp_sqlite, database_url)
    headers = app.sign_in(ANNA)

    added = app.client.post("/api/lists/5/entries", json={"text": "яйца"}, headers=headers)
    assert added.status_code == 201, added.text
    assert added.json()["entries"][0]["id"] > 21
    # A new List and a new user (Telegram sign-in) take ids past 5 and 8 too.
    created = app.client.post("/api/lists", json={"name": "Дача"}, headers=headers)
    assert created.json()["id"] > 5
    newcomer = app.sign_in({"id": 1003, "first_name": "Карлос", "language_code": "es"})
    assert app.client.get("/api/me", headers=newcomer).json()["id"] > 8


def test_queued_notifications_are_still_sent(mvp_sqlite, database_url, monkeypatch, app):
    run_import(monkeypatch, mvp_sqlite, database_url)

    asyncio.run(app.app.state.notifier.deliver_due(utcnow() + timedelta(days=1)))

    # Both rows were Анна's: they go to Борис only, as one "added" and one "bought" message.
    assert {m.chat_id for m in app.sent} == {BORIS["id"]}
    assert len(app.sent) == 2


def test_it_prints_the_row_counts_of_source_and_target(
    mvp_sqlite, database_url, monkeypatch, capsys
):
    run_import(monkeypatch, mvp_sqlite, database_url)

    out = capsys.readouterr().out
    assert "entry: source 2, target 2" in out
    assert "user: source 2, target 2" in out
    assert "idempotency_record: source 0, target 0" in out


def test_it_refuses_a_target_that_already_has_data(
    mvp_sqlite, database_url, monkeypatch, app, count_rows
):
    app.sign_in(ANNA)  # signing in creates a user and their first List
    assert count_rows("user") == 1

    with pytest.raises(SystemExit) as refused:
        run_import(monkeypatch, mvp_sqlite, database_url)

    assert "not empty" in str(refused.value)
    assert count_rows("user") == 1  # nothing was copied


def test_it_refuses_a_missing_source_file(tmp_path, database_url, monkeypatch, count_rows):
    with pytest.raises(SystemExit) as refused:
        run_import(monkeypatch, tmp_path / "nope.db", database_url)

    assert "nope.db" in str(refused.value)
    assert not (tmp_path / "nope.db").exists()  # not created as an empty database
    assert count_rows("user") == 0
