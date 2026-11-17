"""Bot notifications to the other Members, and renaming a Product.

Telegram is the boundary: the app is built with a fake ``send`` that records outgoing messages,
and the test drives time by calling the notifier's ``deliver_due`` with an explicit clock.
"""

import asyncio
from datetime import timedelta
from pathlib import Path

import pytest
from conftest import TEST_BOT_TOKEN, invite_code, sign_init_data
from fastapi.testclient import TestClient

from shopping_list_bot.app import create_app
from shopping_list_bot.config import Settings
from shopping_list_bot.models import utcnow

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
BORIS = {"id": 1002, "first_name": "Борис", "language_code": "ru"}
CARLOS = {"id": 1003, "first_name": "Carlos", "language_code": "es"}


class Harness:
    def __init__(self, tmp_path: Path, database_url: str) -> None:
        self.sent = []

        async def send(message):
            self.sent.append(message)

        settings = Settings(
            bot_token=TEST_BOT_TOKEN,
            bot_username="shared_lists_test_bot",
            webapp_url="https://lists.example",
            database_url=database_url,
            frontend_dist=tmp_path / "no-frontend",
            notify_added_quiet_seconds=180,
            notify_added_max_seconds=900,
            notify_bought_delay_seconds=30,
            _env_file=None,
        )
        self.app = create_app(settings, notify_send=send)
        self.client = TestClient(self.app)

    def sign_in(self, user: dict) -> dict:
        response = self.client.post("/api/auth", json={"init_data": sign_init_data(user)})
        assert response.status_code == 200, response.text
        body = response.json()
        return {"headers": {"Authorization": f"Bearer {body['token']}"}, "lists": body["lists"]}

    def join(self, lst: dict, who: dict, inviter: dict) -> None:
        code = invite_code(self.client, inviter, lst["id"])
        r = self.client.post("/api/lists/join", json={"code": code}, headers=who["headers"])
        assert r.status_code == 200, r.text

    def add(self, who: dict, list_id: int, text: str) -> list[dict]:
        r = self.client.post(
            f"/api/lists/{list_id}/entries", json={"text": text}, headers=who["headers"]
        )
        assert r.status_code == 201, r.text
        return r.json()["entries"]

    def deliver(self, after_seconds: float) -> list:
        before = len(self.sent)
        asyncio.run(
            self.app.state.notifier.deliver_due(utcnow() + timedelta(seconds=after_seconds))
        )
        return self.sent[before:]


@pytest.fixture
def h(tmp_path, database_url):
    harness = Harness(tmp_path, database_url)
    with harness.client:
        yield harness


@pytest.fixture
def shared(h):
    """Анна's first List, shared with Борис and Carlos."""
    anna, boris, carlos = h.sign_in(ANNA), h.sign_in(BORIS), h.sign_in(CARLOS)
    lst = anna["lists"][0]
    h.join(lst, boris, anna)
    h.join(lst, carlos, anna)
    return {"anna": anna, "boris": boris, "carlos": carlos, "list": lst}


class TestAddedNotification:
    def test_a_burst_of_adds_is_one_message_after_the_quiet_period(self, h, shared):
        list_id = shared["list"]["id"]
        h.add(shared["anna"], list_id, "молоко, 2 л; хлеб")
        h.add(shared["anna"], list_id, "яйца")
        assert h.deliver(after_seconds=60) == []  # still within the quiet period

        sent = h.deliver(after_seconds=200)
        by_chat = {m.chat_id: m for m in sent}
        assert set(by_chat) == {BORIS["id"], CARLOS["id"]}  # never the one who added
        assert by_chat[BORIS["id"]].text == "«Покупки» · Анна\nДобавлено: 3 позиции"
        assert by_chat[CARLOS["id"]].text.endswith("Añadido: 3 productos")
        assert by_chat[BORIS["id"]].button_url == f"https://lists.example/?list={list_id}"
        assert h.deliver(after_seconds=400) == []  # sent once

    def test_each_adder_gets_their_own_message(self, h, shared):
        list_id = shared["list"]["id"]
        h.add(shared["anna"], list_id, "молоко")
        h.add(shared["boris"], list_id, "хлеб")
        sent = h.deliver(after_seconds=200)
        to_anna = [m for m in sent if m.chat_id == ANNA["id"]]
        assert [m.text for m in to_anna] == ["«Покупки» · Борис\nДобавлено: 1 позиция"]

    def test_an_entry_removed_before_sending_is_left_out(self, h, shared):
        list_id = shared["list"]["id"]
        entries = h.add(shared["anna"], list_id, "молоко; хлеб")
        r = h.client.delete(
            f"/api/lists/{list_id}/entries/{entries[0]['id']}", headers=shared["anna"]["headers"]
        )
        assert r.status_code == 200, r.text
        sent = h.deliver(after_seconds=200)
        assert {m.text for m in sent} == {
            "«Покупки» · Анна\nДобавлено: 1 позиция",
            "«Покупки» · Анна\nAñadido: 1 producto",
        }

    def test_only_the_count_is_sent_with_the_right_plural(self, h, shared):
        list_id = shared["list"]["id"]
        h.add(shared["anna"], list_id, "a1; a2; a3; a4; a5; a6; a7; a8; a9; a10; a11")
        sent = h.deliver(after_seconds=200)
        text = next(m.text for m in sent if m.chat_id == BORIS["id"])
        assert text == "«Покупки» · Анна\nДобавлено: 11 позиций"

    def test_english_speakers_get_english(self, h, shared):
        dave = h.sign_in({"id": 1004, "first_name": "Dave", "language_code": "en-GB"})
        h.join(shared["list"], dave, shared["anna"])
        h.add(shared["anna"], shared["list"]["id"], "milk")
        sent = h.deliver(after_seconds=200)
        to_dave = next(m for m in sent if m.chat_id == 1004)
        assert to_dave.text == "“Покупки” · Анна\nAdded: 1 item"
        assert to_dave.button_text == "Open list"

    def test_a_list_nobody_shares_sends_nothing(self, h):
        anna = h.sign_in(ANNA)
        h.add(anna, anna["lists"][0]["id"], "молоко")
        assert h.deliver(after_seconds=1000) == []


class TestBoughtNotification:
    def _check_all_and_buy(self, h, who, list_id, entries):
        for e in entries:
            r = h.client.patch(
                f"/api/lists/{list_id}/entries/{e['id']}",
                json={"checked": True},
                headers=who["headers"],
            )
            assert r.status_code == 200, r.text
        r = h.client.post(f"/api/lists/{list_id}/purchases", headers=who["headers"])
        assert r.status_code == 201, r.text
        return r.json()

    def test_kupleno_is_announced_after_the_undo_window(self, h, shared):
        list_id = shared["list"]["id"]
        entries = h.add(shared["boris"], list_id, "молоко; хлеб")
        h.deliver(after_seconds=1000)  # flush the "added" message first
        self._check_all_and_buy(h, shared["anna"], list_id, entries)
        assert h.deliver(after_seconds=10) == []
        sent = h.deliver(after_seconds=31)
        assert {(m.chat_id, m.text) for m in sent} == {
            (BORIS["id"], "«Покупки» · Анна\nКуплено: 2 позиции"),
            (CARLOS["id"], "«Покупки» · Анна\nComprado: 2 productos"),
        }

    def test_an_undone_purchase_is_never_announced(self, h, shared):
        list_id = shared["list"]["id"]
        entries = h.add(shared["boris"], list_id, "молоко")
        h.deliver(after_seconds=1000)
        purchase = self._check_all_and_buy(h, shared["anna"], list_id, entries)
        r = h.client.delete(
            f"/api/lists/{list_id}/purchases/{purchase['id']}", headers=shared["anna"]["headers"]
        )
        assert r.status_code == 200, r.text
        assert h.deliver(after_seconds=60) == []


class TestRenameProduct:
    def test_rename_changes_the_product_and_every_entry(self, h, shared):
        anna, list_id = shared["anna"], shared["list"]["id"]
        first = h.add(anna, list_id, "малоко, 2 л")[0]
        h.add(anna, list_id, "малоко")
        r = h.client.patch(
            f"/api/lists/{list_id}/products/{first['product_id']}",
            json={"name": "молоко"},
            headers=anna["headers"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["merged"] is False
        contents = h.client.get(f"/api/lists/{list_id}/entries", headers=anna["headers"]).json()
        names = [e["name"] for g in contents["categories"] for e in g["entries"]]
        assert names == ["молоко", "молоко"]
        suggestions = h.client.get(
            f"/api/lists/{list_id}/suggestions", params={"q": "мол"}, headers=anna["headers"]
        ).json()
        assert [s["name"] for s in suggestions] == ["молоко"]

    def test_renaming_onto_an_existing_product_merges_them(self, h, shared):
        anna, list_id = shared["anna"], shared["list"]["id"]
        typo = h.add(anna, list_id, "малоко")[0]
        right = h.add(anna, list_id, "молоко")[0]
        r = h.client.patch(
            f"/api/lists/{list_id}/products/{typo['product_id']}",
            json={"name": "Молоко"},
            headers=anna["headers"],
        )
        assert r.status_code == 200, r.text
        assert r.json() == {
            "version": r.json()["version"],
            "product_id": right["product_id"],
            "name": "Молоко",
            "merged": True,
        }
        contents = h.client.get(f"/api/lists/{list_id}/entries", headers=anna["headers"]).json()
        entries = [e for g in contents["categories"] for e in g["entries"]]
        assert {(e["name"], e["product_id"]) for e in entries} == {("Молоко", right["product_id"])}

    def test_rename_needs_membership_and_a_name(self, h, shared):
        anna, list_id = shared["anna"], shared["list"]["id"]
        entry = h.add(anna, list_id, "молоко")[0]
        url = f"/api/lists/{list_id}/products/{entry['product_id']}"
        assert h.client.patch(url, json={"name": "  "}, headers=anna["headers"]).status_code == 422
        stranger = h.sign_in({"id": 9999, "first_name": "Mallory", "language_code": "ru"})
        assert (
            h.client.patch(url, json={"name": "x"}, headers=stranger["headers"]).status_code == 404
        )

    def test_rename_bumps_the_version(self, h, shared):
        anna, list_id = shared["anna"], shared["list"]["id"]
        entry = h.add(anna, list_id, "молоко")[0]
        before = h.client.get(f"/api/lists/{list_id}/entries", headers=anna["headers"]).json()
        r = h.client.patch(
            f"/api/lists/{list_id}/products/{entry['product_id']}",
            json={"name": "кефир"},
            headers=anna["headers"],
        )
        assert r.json()["version"] == before["list"]["version"] + 1
