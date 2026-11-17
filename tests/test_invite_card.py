"""Sharing an Invite as a bot card.

Telegram is the boundary: the app is built with a fake ``prepare_invite`` that records what would
be sent to ``savePreparedInlineMessage`` and answers with a prepared message id.
"""

from pathlib import Path

import pytest
from conftest import TEST_BOT_TOKEN, invite_code, sign_init_data
from fastapi.testclient import TestClient

from shopping_list_bot.app import create_app
from shopping_list_bot.config import Settings
from shopping_list_bot.invite_card import PreparedInvite

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
CARLOS = {"id": 2002, "first_name": "Carlos", "language_code": "es-MX"}
DIANA = {"id": 3003, "first_name": "Diana", "language_code": "en"}


@pytest.fixture
def prepared(tmp_path: Path, database_url: str):
    """A client whose Bot API is faked; ``calls`` collects what the backend asked it to store."""
    calls: list[PreparedInvite] = []
    fail = {"on": False}

    async def prepare_invite(card: PreparedInvite) -> str:
        if fail["on"]:
            raise RuntimeError("Bot API is down")
        calls.append(card)
        return f"prepared-{len(calls)}"

    settings = Settings(
        bot_token=TEST_BOT_TOKEN,
        bot_username="shared_lists_test_bot",
        database_url=database_url,
        frontend_dist=tmp_path / "no-frontend",
        _env_file=None,
    )
    with TestClient(create_app(settings, prepare_invite=prepare_invite)) as client:

        def sign_in(user: dict) -> dict:
            r = client.post("/api/auth", json={"init_data": sign_init_data(user)})
            assert r.status_code == 200, r.text
            return {"headers": {"Authorization": f"Bearer {r.json()['token']}"}}

        yield client, sign_in, calls, fail


def first_list(client, session) -> dict:
    return client.get("/api/lists", headers=session["headers"]).json()[0]


def prepare(client, session, list_id):
    return client.post(f"/api/lists/{list_id}/invite/prepared", headers=session["headers"])


class TestPreparedInvite:
    def test_returns_the_prepared_message_id(self, prepared):
        client, sign_in, calls, _ = prepared
        anna = sign_in(ANNA)
        lst = first_list(client, anna)
        response = prepare(client, anna, lst["id"])
        assert response.status_code == 200
        assert response.json() == {"id": "prepared-1"}
        assert len(calls) == 1

    def test_the_card_is_for_the_sender_with_a_button_to_their_invite_link(self, prepared):
        client, sign_in, calls, _ = prepared
        anna = sign_in(ANNA)
        lst = first_list(client, anna)
        prepare(client, anna, lst["id"])
        code = invite_code(client, anna, lst["id"])
        (card,) = calls
        assert card.user_id == ANNA["id"]
        assert card.button_url == f"https://t.me/shared_lists_test_bot?startapp=join_{code}"

    @pytest.mark.parametrize(
        ("user", "text", "button"),
        [
            (ANNA, "Анна приглашает вас в список «Покупки»", "Открыть список"),
            (CARLOS, "Carlos te invita a la lista «Compras»", "Abrir la lista"),
            (DIANA, "Diana invites you to the list “Groceries”", "Open list"),
        ],
    )
    def test_the_card_speaks_the_senders_language(self, prepared, user, text, button):
        client, sign_in, calls, _ = prepared
        session = sign_in(user)
        prepare(client, session, first_list(client, session)["id"])
        (card,) = calls
        assert card.text == text
        assert card.button_text == button

    def test_a_non_member_cannot_prepare_a_card(self, prepared):
        client, sign_in, calls, _ = prepared
        lst = first_list(client, sign_in(ANNA))
        assert prepare(client, sign_in(CARLOS), lst["id"]).status_code == 404
        assert calls == []

    def test_it_needs_a_session(self, prepared):
        client, sign_in, _, _ = prepared
        lst = first_list(client, sign_in(ANNA))
        assert client.post(f"/api/lists/{lst['id']}/invite/prepared").status_code == 401

    def test_a_bot_api_failure_is_a_bad_gateway(self, prepared):
        client, sign_in, _, fail = prepared
        anna = sign_in(ANNA)
        fail["on"] = True
        assert prepare(client, anna, first_list(client, anna)["id"]).status_code == 502

    def test_without_a_bot_api_the_card_is_unavailable(self, client, sign_in):
        anna = sign_in(ANNA)
        lst = client.get("/api/lists", headers=anna["headers"]).json()[0]
        assert prepare(client, anna, lst["id"]).status_code == 503

    def test_without_a_bot_username_the_card_is_unavailable(self, tmp_path, database_url):
        calls: list[PreparedInvite] = []

        async def prepare_invite(card: PreparedInvite) -> str:
            calls.append(card)
            return "prepared"

        settings = Settings(
            bot_token=TEST_BOT_TOKEN,
            bot_username="",
            database_url=database_url,
            frontend_dist=tmp_path / "no-frontend",
            _env_file=None,
        )
        with TestClient(create_app(settings, prepare_invite=prepare_invite)) as client:
            r = client.post("/api/auth", json={"init_data": sign_init_data(ANNA)})
            anna = {"headers": {"Authorization": f"Bearer {r.json()['token']}"}}
            assert prepare(client, anna, first_list(client, anna)["id"]).status_code == 503
        assert calls == []
