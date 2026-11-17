"""Schema management: the app only runs on a migrated database; `migrate` brings one up to date."""

import logging
import sys

import pytest
from conftest import TEST_BOT_TOKEN, sign_init_data
from fastapi.testclient import TestClient

from shopping_list_bot import main
from shopping_list_bot.app import create_app
from shopping_list_bot.config import Settings

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
