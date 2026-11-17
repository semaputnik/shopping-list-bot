"""Schema management: the app only runs on a migrated database; `migrate` brings one up to date."""

import logging
import sys
from datetime import UTC, datetime

import pytest
from conftest import TEST_BOT_TOKEN, sign_init_data
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from shopping_list_bot import main
from shopping_list_bot.app import create_app
from shopping_list_bot.config import Settings
from shopping_list_bot.migrate import downgrade, upgrade

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}


def settings_for(url: str, tmp_path) -> Settings:
    return Settings(
        bot_token=TEST_BOT_TOKEN,
        database_url=url,
        frontend_dist=tmp_path / "no-frontend",
        _env_file=None,
    )


def test_app_refuses_to_start_on_an_unmigrated_database(blank_database_url, tmp_path, caplog):
    app = create_app(settings_for(blank_database_url, tmp_path))
    with caplog.at_level(logging.ERROR), pytest.raises(RuntimeError), TestClient(app):
        pass
    assert "shopping-list-bot migrate" in caplog.text


def test_migrate_command_prepares_a_blank_database_for_the_app(
    blank_database_url, tmp_path, monkeypatch
):
    monkeypatch.setenv("SL_DATABASE_URL", blank_database_url)
    monkeypatch.setattr(sys, "argv", ["shopping-list-bot", "migrate"])
    main()

    with TestClient(create_app(settings_for(blank_database_url, tmp_path))) as client:
        response = client.post("/api/auth", json={"init_data": sign_init_data(ANNA)})
        assert response.status_code == 200
        headers = {"Authorization": f"Bearer {response.json()['token']}"}
        assert len(client.get("/api/lists", headers=headers).json()) == 1


def test_migrate_is_safe_to_run_twice(blank_database_url, monkeypatch):
    monkeypatch.setenv("SL_DATABASE_URL", blank_database_url)
    monkeypatch.setattr(sys, "argv", ["shopping-list-bot", "migrate"])
    main()
    main()


@pytest.fixture
def old_schema(blank_database_url):
    """A database at the first migration, holding one user, a shared List, an Entry and a
    queued notification: the state a live deployment is in before the hardening migration."""
    upgrade(blank_database_url, "0001")
    engine = create_engine(blank_database_url)
    now = datetime.now(UTC)
    with engine.begin() as conn:
        conn.execute(
            text(
                'INSERT INTO "user" (telegram_id, first_name, created_at) '
                "VALUES (1001, 'Анна', :now), (1002, 'Борис', :now)"
            ),
            {"now": now},
        )
        conn.execute(
            text(
                'INSERT INTO "list" (name, share_code, created_by, created_at, updated_at, '
                "version) VALUES ('Покупки', 'code', 1, :now, :now, 1)"
            ),
            {"now": now},
        )
        conn.execute(
            text(
                "INSERT INTO list_member (list_id, user_id, joined_at) "
                "VALUES (1, 1, :now), (1, 2, :now)"
            ),
            {"now": now},
        )
        conn.execute(
            text(
                "INSERT INTO product (list_id, name, name_norm, category_key, created_at) "
                "VALUES (1, 'молоко', 'молоко', 'dairy', :now)"
            ),
            {"now": now},
        )
        conn.execute(
            text(
                "INSERT INTO entry (list_id, product_id, name, added_by, created_at) "
                "VALUES (1, 1, 'молоко', 1, :now)"
            ),
            {"now": now},
        )
        conn.execute(
            text(
                "INSERT INTO notification (list_id, actor_id, kind, items, first_at, due_at) "
                "VALUES (1, 1, 'added', '[[1, \"молоко\"]]', :now, :now)"
            ),
            {"now": now},
        )
    yield engine
    engine.dispose()


def test_hardening_migration_keeps_the_data_and_the_app_working(
    old_schema, blank_database_url, tmp_path
):
    upgrade(blank_database_url)

    with TestClient(create_app(settings_for(blank_database_url, tmp_path))) as client:
        response = client.post("/api/auth", json={"init_data": sign_init_data(ANNA)})
        headers = {"Authorization": f"Bearer {response.json()['token']}"}
        lists = client.get("/api/lists", headers=headers).json()
        assert [lst["name"] for lst in lists] == ["Покупки"]
        added = client.post(
            f"/api/lists/{lists[0]['id']}/entries", json={"text": "хлеб"}, headers=headers
        )
        assert added.status_code == 201, added.text
        contents = client.get(f"/api/lists/{lists[0]['id']}/entries", headers=headers).json()
        names = {e["name"] for group in contents["categories"] for e in group["entries"]}
        assert names == {"молоко", "хлеб"}


def test_hardening_migration_downgrades_and_upgrades_again(old_schema, blank_database_url):
    upgrade(blank_database_url)
    downgrade(blank_database_url, "0001")
    upgrade(blank_database_url)
    with old_schema.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM entry")).scalar_one() == 1


@pytest.mark.parametrize(
    "statement",
    [
        (
            "INSERT INTO notification (list_id, actor_id, kind, items, first_at, due_at) "
            "VALUES (1, 1, 'gossip', '[]', now(), now())"
        ),
        (
            "INSERT INTO list_change (list_id, version, kind, created_at) "
            "VALUES (1, 99, 'entry.exploded', now())"
        ),
        "UPDATE product SET category_key = 'snacks-and-vibes' WHERE id = 1",
        "UPDATE \"user\" SET language = 'de' WHERE id = 1",
    ],
    ids=["notification.kind", "list_change.kind", "product.category_key", "user.language"],
)
def test_database_rejects_values_outside_the_known_sets(old_schema, blank_database_url, statement):
    upgrade(blank_database_url)
    with pytest.raises(IntegrityError), old_schema.begin() as conn:
        conn.execute(text(statement))
