import re

from conftest import TEST_BOT_TOKEN, invite_code, sign_init_data
from fastapi.testclient import TestClient

from shopping_list_bot.app import create_app
from shopping_list_bot.config import Settings

ANNA = {
    "id": 1001,
    "first_name": "Анна",
    "last_name": "Иванова",
    "language_code": "ru",
    "photo_url": "https://t.me/i/userpic/320/anna.jpg",
}
CARLOS = {"id": 2002, "first_name": "Carlos", "language_code": "es-MX"}
DIANA = {"id": 3003, "first_name": "Диана"}


def my_lists(client, session):
    return client.get("/api/lists", headers=session["headers"]).json()


def join(client, session, code):
    return client.post("/api/lists/join", json={"code": code}, headers=session["headers"])


class TestInviteLink:
    def test_code_is_long_url_safe_and_permanent(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        code = invite_code(client, anna, lst["id"])
        assert len(code) >= 16
        assert re.fullmatch(r"[A-Za-z0-9_-]+", code)
        assert invite_code(client, sign_in(ANNA), lst["id"]) == code

    def test_codes_differ_between_lists(self, client, sign_in):
        anna, carlos = sign_in(ANNA), sign_in(CARLOS)
        a = invite_code(client, anna, my_lists(client, anna)[0]["id"])
        b = invite_code(client, carlos, my_lists(client, carlos)[0]["id"])
        assert a != b

    def test_url_is_a_bot_startapp_link_with_the_join_prefix(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        invite = client.get(f"/api/lists/{lst['id']}/invite", headers=anna["headers"]).json()
        assert invite["url"] == f"https://t.me/shared_lists_test_bot?startapp=join_{invite['code']}"

    def test_the_list_payload_carries_no_link(self, client, sign_in):
        (lst,) = my_lists(client, sign_in(ANNA))
        assert "share_code" not in lst
        assert "share_url" not in lst

    def test_each_member_has_their_own_link(self, client, sign_in, add_member):
        anna, carlos = sign_in(ANNA), sign_in(CARLOS)
        (lst,) = my_lists(client, anna)
        add_member(lst, carlos, anna)
        assert invite_code(client, carlos, lst["id"]) != invite_code(client, anna, lst["id"])

    def test_a_non_member_has_no_link(self, client, sign_in):
        (lst,) = my_lists(client, sign_in(ANNA))
        carlos = sign_in(CARLOS)
        link = client.get(f"/api/lists/{lst['id']}/invite", headers=carlos["headers"])
        assert link.status_code == 404
        reset = client.post(f"/api/lists/{lst['id']}/invite/reset", headers=carlos["headers"])
        assert reset.status_code == 404

    def test_the_link_needs_a_session(self, client, sign_in):
        (lst,) = my_lists(client, sign_in(ANNA))
        assert client.get(f"/api/lists/{lst['id']}/invite").status_code == 401


class TestReset:
    def test_reset_issues_a_new_link_and_the_old_one_stops_working(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        old = invite_code(client, anna, lst["id"])
        reset = client.post(f"/api/lists/{lst['id']}/invite/reset", headers=anna["headers"])
        assert reset.status_code == 200
        new = reset.json()["code"]
        assert new != old
        assert invite_code(client, anna, lst["id"]) == new  # the new one is the active one

        carlos = sign_in(CARLOS)
        assert join(client, carlos, old).status_code == 404
        assert lst["id"] not in [x["id"] for x in my_lists(client, carlos)]
        assert join(client, carlos, f"join_{old}").status_code == 404
        assert join(client, carlos, new).status_code == 200

    def test_reset_by_one_member_leaves_the_others_links_alone(self, client, sign_in, add_member):
        anna, carlos = sign_in(ANNA), sign_in(CARLOS)
        (lst,) = my_lists(client, anna)
        add_member(lst, carlos, anna)
        carlos_code = invite_code(client, carlos, lst["id"])
        client.post(f"/api/lists/{lst['id']}/invite/reset", headers=anna["headers"])
        assert invite_code(client, carlos, lst["id"]) == carlos_code
        assert join(client, sign_in(DIANA), carlos_code).status_code == 200

    def test_reset_does_not_remove_members_who_already_joined(self, client, sign_in, add_member):
        anna, carlos = sign_in(ANNA), sign_in(CARLOS)
        (lst,) = my_lists(client, anna)
        add_member(lst, carlos, anna)
        client.post(f"/api/lists/{lst['id']}/invite/reset", headers=anna["headers"])
        assert len(my_lists(client, carlos)[0]["members"]) == 2


class TestLinkPayload:
    def test_join_accepts_the_prefixed_payload_and_a_legacy_bare_code(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        code = invite_code(client, anna, lst["id"])
        assert join(client, sign_in(CARLOS), f"join_{code}").status_code == 200
        assert join(client, sign_in(DIANA), code).status_code == 200

    def test_signing_in_through_a_prefixed_link_creates_no_own_list(self, client, sign_in):
        anna = sign_in(ANNA)
        code = invite_code(client, anna, my_lists(client, anna)[0]["id"])
        carlos = sign_in(CARLOS, start_param=f"join_{code}")
        assert my_lists(client, carlos) == []

    def test_a_revoked_code_is_the_bad_link_flow(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        old = invite_code(client, anna, lst["id"])
        client.post(f"/api/lists/{lst['id']}/invite/reset", headers=anna["headers"])
        carlos = sign_in(CARLOS, start_param=f"join_{old}")
        assert len(my_lists(client, carlos)) == 1  # not left with nothing
        assert join(client, carlos, f"join_{old}").status_code == 404


def inviters(members):
    return {m["first_name"]: m["invited_by"] and m["invited_by"]["first_name"] for m in members}


class TestAttribution:
    def test_a_member_says_whose_link_they_joined_through(self, client, sign_in, add_member):
        anna, carlos, diana = sign_in(ANNA), sign_in(CARLOS), sign_in(DIANA)
        (lst,) = my_lists(client, anna)
        add_member(lst, carlos, anna)
        add_member(lst, diana, carlos)
        members = my_lists(client, diana)[0]["members"]
        assert inviters(members) == {"Анна": None, "Carlos": "Анна", "Диана": "Carlos"}
        assert "telegram_id" not in members[1]["invited_by"]

    def test_opening_a_second_link_keeps_the_first_inviter(self, client, sign_in, add_member):
        anna, carlos, diana = sign_in(ANNA), sign_in(CARLOS), sign_in(DIANA)
        (lst,) = my_lists(client, anna)
        add_member(lst, carlos, anna)
        add_member(lst, diana, anna)
        add_member(lst, diana, carlos)
        assert inviters(my_lists(client, anna)[0]["members"])["Диана"] == "Анна"

    def test_the_inviter_stays_after_the_link_is_reset(self, client, sign_in, add_member):
        anna, carlos = sign_in(ANNA), sign_in(CARLOS)
        (lst,) = my_lists(client, anna)
        add_member(lst, carlos, anna)
        client.post(f"/api/lists/{lst['id']}/invite/reset", headers=anna["headers"])
        assert inviters(my_lists(client, anna)[0]["members"])["Carlos"] == "Анна"


class TestJoin:
    def test_new_user_joins_and_sees_the_list_with_both_members(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        carlos = sign_in(CARLOS, start_param=invite_code(client, anna, lst["id"]))
        assert my_lists(client, carlos) == []  # no auto-created List

        response = join(client, carlos, invite_code(client, anna, lst["id"]))
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == lst["id"]
        assert [m["first_name"] for m in body["members"]] == ["Анна", "Carlos"]
        assert [x["id"] for x in my_lists(client, carlos)] == [lst["id"]]
        # Equal rights: the other Member sees the new Member too.
        assert len(my_lists(client, anna)[0]["members"]) == 2

    def test_joining_bumps_the_list_version(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        join(client, sign_in(CARLOS), invite_code(client, anna, lst["id"]))
        assert my_lists(client, anna)[0]["version"] == lst["version"] + 1

    def test_existing_member_just_opens_the_list(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        response = join(client, anna, invite_code(client, anna, lst["id"]))
        assert response.status_code == 200
        assert response.json()["id"] == lst["id"]
        assert len(response.json()["members"]) == 1
        assert response.json()["version"] == lst["version"]

    def test_joining_twice_adds_one_membership(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        carlos = sign_in(CARLOS)
        join(client, carlos, invite_code(client, anna, lst["id"]))
        second = join(client, carlos, invite_code(client, anna, lst["id"]))
        assert second.status_code == 200
        assert len(second.json()["members"]) == 2

    def test_user_with_own_list_keeps_it_and_gains_the_shared_one(self, client, sign_in):
        anna = sign_in(ANNA)
        code = invite_code(client, anna, my_lists(client, anna)[0]["id"])
        carlos = sign_in(CARLOS)
        join(client, carlos, code)
        assert len(my_lists(client, carlos)) == 2

    def test_invalid_code_is_an_error_and_joins_nothing(self, client, sign_in):
        carlos = sign_in(CARLOS)
        before = my_lists(client, carlos)
        response = join(client, carlos, "no-such-code-at-all")
        assert response.status_code == 404
        assert my_lists(client, carlos) == before

    def test_join_requires_a_session(self, client, sign_in):
        anna = sign_in(ANNA)
        code = invite_code(client, anna, my_lists(client, anna)[0]["id"])
        assert client.post("/api/lists/join", json={"code": code}).status_code == 401

    def test_list_is_readable_only_after_joining(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        carlos = sign_in(CARLOS)
        assert client.get(f"/api/lists/{lst['id']}", headers=carlos["headers"]).status_code == 404
        join(client, carlos, invite_code(client, anna, lst["id"]))
        assert client.get(f"/api/lists/{lst['id']}", headers=carlos["headers"]).status_code == 200


class TestNoAutoCreateRule:
    def test_first_time_user_with_a_real_code_gets_no_list(self, client, sign_in):
        anna = sign_in(ANNA)
        code = invite_code(client, anna, my_lists(client, anna)[0]["id"])
        diana = sign_in(DIANA, start_param=code)
        assert my_lists(client, diana) == []
        # Still none on a later plain sign-in; the join is what gives them a List.
        assert my_lists(client, sign_in(DIANA)) == []

    def test_first_time_user_without_a_code_gets_a_first_list(self, client, sign_in):
        assert len(my_lists(client, sign_in(DIANA))) == 1

    def test_first_time_user_with_an_invalid_code_is_not_left_with_nothing(self, client, sign_in):
        diana = sign_in(DIANA, start_param="stale-or-garbage-code")
        assert len(my_lists(client, diana)) == 1

    def test_returning_user_through_a_link_gets_no_extra_list(self, client, sign_in):
        anna = sign_in(ANNA)
        code = invite_code(client, anna, my_lists(client, anna)[0]["id"])
        carlos = sign_in(CARLOS)
        carlos_again = sign_in(CARLOS, start_param=code)
        assert len(my_lists(client, carlos_again)) == len(my_lists(client, carlos)) == 1


def test_members_expose_names_and_photos_but_no_telegram_ids(client, sign_in):
    (lst,) = my_lists(client, sign_in(ANNA))
    (member,) = lst["members"]
    assert member["photo_url"] == ANNA["photo_url"]
    assert member["first_name"] == "Анна"
    assert "telegram_id" not in member


class TestInviteUrlConfiguration:
    def _invite(self, tmp_path, database_url, bot_username):
        settings = Settings(
            bot_token=TEST_BOT_TOKEN,
            bot_username=bot_username,
            database_url=database_url,
            frontend_dist=tmp_path / "no-frontend",
            _env_file=None,
        )
        with TestClient(create_app(settings)) as c:
            auth = c.post("/api/auth", json={"init_data": sign_init_data(ANNA)}).json()
            headers = {"Authorization": f"Bearer {auth['token']}"}
            (lst,) = c.get("/api/lists", headers=headers).json()
            return c.get(f"/api/lists/{lst['id']}/invite", headers=headers).json()

    def test_url_is_null_without_a_bot_username(self, tmp_path, database_url):
        assert self._invite(tmp_path, database_url, "")["url"] is None

    def test_leading_at_sign_is_stripped_from_the_bot_username(self, tmp_path, database_url):
        invite = self._invite(tmp_path, database_url, "@my_bot")
        assert invite["url"] == f"https://t.me/my_bot?startapp=join_{invite['code']}"


def test_join_rejects_an_overlong_code(client, sign_in):
    response = join(client, sign_in(ANNA), "x" * 65)
    assert response.status_code == 422
