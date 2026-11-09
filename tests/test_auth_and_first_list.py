import time

import pytest
from conftest import sign_init_data

ANNA = {
    "id": 1001,
    "first_name": "Анна",
    "last_name": "Иванова",
    "username": "anna",
    "photo_url": "https://t.me/i/userpic/320/anna.jpg",
    "language_code": "ru",
}
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

    @pytest.mark.parametrize("garbage", ["", "not-init-data", "hash=abc"])
    def test_garbage_is_rejected(self, client, garbage):
        assert post_auth(client, garbage).status_code == 401

    def test_api_requires_a_session(self, client):
        assert client.get("/api/me").status_code == 401
        assert client.get("/api/lists").status_code == 401
        bad = {"Authorization": "Bearer 1.9999999999.forged"}
        assert client.get("/api/me", headers=bad).status_code == 401


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

    def test_arriving_through_a_share_link_creates_no_list(self, client, sign_in):
        session = sign_in(ANNA, start_param="some-share-code")
        assert session["response"]["start_param"] == "some-share-code"
        assert client.get("/api/lists", headers=session["headers"]).json() == []

    def test_user_who_first_arrived_by_share_link_is_not_given_a_list_later(self, client, sign_in):
        sign_in(ANNA, start_param="some-share-code")
        later = sign_in(ANNA)
        assert client.get("/api/lists", headers=later["headers"]).json() == []

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
