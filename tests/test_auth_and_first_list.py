import hashlib
import hmac
import time

import pytest
from conftest import TEST_BOT_TOKEN, sign_init_data
from fastapi.testclient import TestClient

from shopping_list_bot.app import create_app
from shopping_list_bot.auth import issue_session_token
from shopping_list_bot.config import Settings

ANNA = {
    "id": 1001,
    "first_name": "Анна",
    "last_name": "Иванова",
    "username": "anna",
    "photo_url": "https://t.me/i/userpic/320/anna.jpg",
    "language_code": "ru",
}


def derived_secret(bot_token: str) -> str:
    """The session secret create_app derives when SL_SESSION_SECRET is unset."""
    return hmac.new(b"shared-lists-session", bot_token.encode(), hashlib.sha256).hexdigest()


CARLOS = {"id": 2002, "first_name": "Carlos", "language_code": "es-MX"}


def post_auth(client, init_data):
    return client.post("/api/auth", json={"init_data": init_data})


class TestInitDataVerification:
    def test_valid_init_data_issues_a_session(self, client):
        response = post_auth(client, sign_init_data(ANNA))
        assert response.status_code == 200
        body = response.json()
        headers = {"Authorization": f"Bearer {body['token']}"}
        assert client.get("/api/me", headers=headers).json()["telegram_id"] == 1001

    def test_tampered_payload_is_rejected(self, client):
        init_data = sign_init_data(ANNA).replace("%D0%90%D0%BD%D0%BD%D0%B0", "Mallory")
        assert "Mallory" in init_data
        assert post_auth(client, init_data).status_code == 401

    def test_swapped_user_id_is_rejected(self, client):
        # Reuse a genuine signature while claiming to be someone else.
        genuine = sign_init_data(ANNA)
        forged_user = sign_init_data({**ANNA, "id": 9999})
        hash_of_anna = genuine.split("hash=")[1]
        forged = forged_user.split("&hash=")[0] + "&hash=" + hash_of_anna
        assert post_auth(client, forged).status_code == 401

    def test_signed_with_another_bot_token_is_rejected(self, client):
        init_data = sign_init_data(ANNA, bot_token="999:other-bot")
        assert post_auth(client, init_data).status_code == 401

    def test_missing_hash_is_rejected(self, client):
        init_data = sign_init_data(ANNA).split("&hash=")[0]
        assert post_auth(client, init_data).status_code == 401

    def test_expired_auth_date_is_rejected(self, client):
        two_days_ago = int(time.time()) - 2 * 24 * 3600
        assert post_auth(client, sign_init_data(ANNA, auth_date=two_days_ago)).status_code == 401

    def test_auth_date_far_in_the_future_is_rejected(self, client):
        tomorrow = int(time.time()) + 24 * 3600
        assert post_auth(client, sign_init_data(ANNA, auth_date=tomorrow)).status_code == 401

    def test_missing_user_is_rejected(self, client):
        assert post_auth(client, sign_init_data(None)).status_code == 401

    @pytest.mark.parametrize("garbage", ["", "not-init-data", "hash=abc", "hash=%D0%90"])
    def test_garbage_is_rejected(self, client, garbage):
        assert post_auth(client, garbage).status_code == 401

    def test_init_data_shaped_like_real_telegram_output_verifies(self, client):
        user = {
            **ANNA,
            "photo_url": "https://t.me/i/userpic/320/a?b=c&d=e",
            "allows_write_to_pm": True,
        }
        init_data = sign_init_data(
            user,
            extra={
                "query_id": "AAHdF6IQAAAAAN0XohDhrOrc",
                "chat_instance": "-1234567890123456789",
                "chat_type": "sender",
                "signature": "abc_DEF-123",
            },
        )
        assert post_auth(client, init_data).status_code == 200

    def test_api_requires_a_session(self, client):
        assert client.get("/api/me").status_code == 401
        assert client.get("/api/lists").status_code == 401
        bad = {"Authorization": "Bearer 1.9999999999.forged"}
        assert client.get("/api/me", headers=bad).status_code == 401

    def test_non_ascii_bearer_token_is_rejected(self, client):
        bad = {"Authorization": "Bearer 1.9999999999.\u00e9".encode("latin-1")}
        assert client.get("/api/me", headers=bad).status_code == 401

    def test_expired_session_is_rejected(self, tmp_path):
        settings = Settings(
            bot_token=TEST_BOT_TOKEN,
            database_url=f"sqlite:///{tmp_path / 'expired.db'}",
            frontend_dist=tmp_path / "no-frontend",
            session_ttl_seconds=-10,
            _env_file=None,
        )
        with TestClient(create_app(settings)) as c:
            token = post_auth(c, sign_init_data(ANNA)).json()["token"]
            assert c.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401

    def test_validly_signed_session_for_unknown_user_is_rejected(self, client):
        token, _ = issue_session_token(424242, derived_secret(TEST_BOT_TOKEN), 3600)
        assert (
            client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
        )

    def test_no_secret_configured_accepts_no_session(self, tmp_path):
        settings = Settings(
            bot_token="",
            database_url=f"sqlite:///{tmp_path / 'nosecret.db'}",
            frontend_dist=tmp_path / "no-frontend",
            _env_file=None,
        )
        with TestClient(create_app(settings)) as c:
            assert post_auth(c, sign_init_data(ANNA)).status_code == 401
            # A token minted with the public, would-be-derived key must not work.
            token, _ = issue_session_token(1, derived_secret(""), 3600)
            assert c.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


class TestUserUpsert:
    def test_profile_is_stored_from_init_data(self, sign_in):
        user = sign_in(ANNA)["response"]["user"]
        assert user["telegram_id"] == 1001
        assert user["first_name"] == "Анна"
        assert user["last_name"] == "Иванова"
        assert user["photo_url"] == ANNA["photo_url"]
        assert user["language_code"] == "ru"

    def test_returning_user_is_updated_not_duplicated(self, client, sign_in):
        first = sign_in(ANNA)["response"]["user"]
        renamed = {**ANNA, "first_name": "Аня", "photo_url": None, "language_code": "es"}
        second = sign_in(renamed)
        assert second["response"]["user"]["id"] == first["id"]
        me = client.get("/api/me", headers=second["headers"]).json()
        assert me["first_name"] == "Аня"
        assert me["photo_url"] is None
        assert me["language_code"] == "es"
        assert me["language"] == "es"

    @pytest.mark.parametrize(
        ("language_code", "expected"),
        [("ru", "ru"), ("es", "es"), ("es-MX", "es"), ("ES", "es"), ("en", "ru"), (None, "ru")],
    )
    def test_interface_language_is_picked_from_language_code(
        self, sign_in, language_code, expected
    ):
        user = {"id": 5, "first_name": "X"}
        if language_code is not None:
            user["language_code"] = language_code
        assert sign_in(user)["response"]["user"]["language"] == expected


class TestFirstList:
    def test_first_time_russian_user_gets_pokupki(self, client, sign_in):
        lists = client.get("/api/lists", headers=sign_in(ANNA)["headers"]).json()
        assert [lst["name"] for lst in lists] == ["Покупки"]

    def test_first_time_spanish_user_gets_compras(self, client, sign_in):
        lists = client.get("/api/lists", headers=sign_in(CARLOS)["headers"]).json()
        assert [lst["name"] for lst in lists] == ["Compras"]

    def test_returning_user_is_not_given_another_list(self, client, sign_in):
        sign_in(ANNA)
        again = sign_in(ANNA)
        assert len(client.get("/api/lists", headers=again["headers"]).json()) == 1

    def share_code_of(self, client, sign_in, user):
        (lst,) = client.get("/api/lists", headers=sign_in(user)["headers"]).json()
        return lst["share_code"]

    def test_arriving_through_a_real_share_link_creates_no_own_list(self, client, sign_in):
        code = self.share_code_of(client, sign_in, ANNA)
        session = sign_in(CARLOS, start_param=code)
        assert session["response"]["start_param"] == code
        assert client.get("/api/lists", headers=session["headers"]).json() == []

    def test_user_who_first_arrived_by_a_real_share_link_is_not_given_a_list_later(
        self, client, sign_in
    ):
        code = self.share_code_of(client, sign_in, ANNA)
        sign_in(CARLOS, start_param=code)
        later = sign_in(CARLOS)
        assert client.get("/api/lists", headers=later["headers"]).json() == []

    @pytest.mark.parametrize(("user", "name"), [(ANNA, "Покупки"), (CARLOS, "Compras")])
    def test_unknown_start_param_still_gets_the_first_list(self, client, sign_in, user, name):
        session = sign_in(user, start_param="stale-or-bogus-code")
        lists = client.get("/api/lists", headers=session["headers"]).json()
        assert [lst["name"] for lst in lists] == [name]

    def test_list_has_an_unguessable_share_code_and_starting_version(self, client, sign_in):
        headers = sign_in(ANNA)["headers"]
        (lst,) = client.get("/api/lists", headers=headers).json()
        assert len(lst["share_code"]) >= 16
        assert lst["version"] == 0

    def test_share_codes_differ_between_lists(self, client, sign_in):
        a = client.get("/api/lists", headers=sign_in(ANNA)["headers"]).json()[0]
        b = client.get("/api/lists", headers=sign_in(CARLOS)["headers"]).json()[0]
        assert a["share_code"] != b["share_code"]


class TestListAccess:
    def test_member_can_open_their_list(self, client, sign_in):
        headers = sign_in(ANNA)["headers"]
        (lst,) = client.get("/api/lists", headers=headers).json()
        opened = client.get(f"/api/lists/{lst['id']}", headers=headers)
        assert opened.status_code == 200
        assert opened.json()["name"] == "Покупки"

    def test_users_only_see_their_own_lists(self, client, sign_in):
        anna = sign_in(ANNA)["headers"]
        carlos = sign_in(CARLOS)["headers"]
        (annas_list,) = client.get("/api/lists", headers=anna).json()
        assert client.get(f"/api/lists/{annas_list['id']}", headers=carlos).status_code == 404
        assert [lst["name"] for lst in client.get("/api/lists", headers=carlos).json()] == [
            "Compras"
        ]

    def test_unknown_list_is_404(self, client, sign_in):
        assert client.get("/api/lists/424242", headers=sign_in(ANNA)["headers"]).status_code == 404


def test_health_check(client):
    assert client.get("/healthz").json() == {"status": "ok"}
