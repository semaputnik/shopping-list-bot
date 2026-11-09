import re

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


class TestShareCode:
    def test_code_is_long_url_safe_and_permanent(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        assert len(lst["share_code"]) >= 16
        assert re.fullmatch(r"[A-Za-z0-9_-]+", lst["share_code"])
        again = sign_in(ANNA)
        assert my_lists(client, again)[0]["share_code"] == lst["share_code"]

    def test_codes_differ_between_lists(self, client, sign_in):
        a = my_lists(client, sign_in(ANNA))[0]["share_code"]
        b = my_lists(client, sign_in(CARLOS))[0]["share_code"]
        assert a != b

    def test_share_url_is_a_bot_startapp_link(self, client, sign_in):
        (lst,) = my_lists(client, sign_in(ANNA))
        expected = f"https://t.me/shared_lists_test_bot?startapp={lst['share_code']}"
        assert lst["share_url"] == expected


class TestJoin:
    def test_new_user_joins_and_sees_the_list_with_both_members(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        carlos = sign_in(CARLOS, start_param=lst["share_code"])
        assert my_lists(client, carlos) == []  # no auto-created List

        response = join(client, carlos, lst["share_code"])
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
        join(client, sign_in(CARLOS), lst["share_code"])
        assert my_lists(client, anna)[0]["version"] == lst["version"] + 1

    def test_existing_member_just_opens_the_list(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        response = join(client, anna, lst["share_code"])
        assert response.status_code == 200
        assert response.json()["id"] == lst["id"]
        assert len(response.json()["members"]) == 1
        assert response.json()["version"] == lst["version"]

    def test_joining_twice_adds_one_membership(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        carlos = sign_in(CARLOS)
        join(client, carlos, lst["share_code"])
        second = join(client, carlos, lst["share_code"])
        assert second.status_code == 200
        assert len(second.json()["members"]) == 2

    def test_user_with_own_list_keeps_it_and_gains_the_shared_one(self, client, sign_in):
        code = my_lists(client, sign_in(ANNA))[0]["share_code"]
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
        code = my_lists(client, sign_in(ANNA))[0]["share_code"]
        assert client.post("/api/lists/join", json={"code": code}).status_code == 401

    def test_list_is_readable_only_after_joining(self, client, sign_in):
        anna = sign_in(ANNA)
        (lst,) = my_lists(client, anna)
        carlos = sign_in(CARLOS)
        assert client.get(f"/api/lists/{lst['id']}", headers=carlos["headers"]).status_code == 404
        join(client, carlos, lst["share_code"])
        assert client.get(f"/api/lists/{lst['id']}", headers=carlos["headers"]).status_code == 200


class TestNoAutoCreateRule:
    def test_first_time_user_with_a_real_code_gets_no_list(self, client, sign_in):
        code = my_lists(client, sign_in(ANNA))[0]["share_code"]
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
        code = my_lists(client, sign_in(ANNA))[0]["share_code"]
        carlos = sign_in(CARLOS)
        carlos_again = sign_in(CARLOS, start_param=code)
        assert len(my_lists(client, carlos_again)) == len(my_lists(client, carlos)) == 1


def test_members_expose_names_and_photos_but_no_telegram_ids(client, sign_in):
    (lst,) = my_lists(client, sign_in(ANNA))
    (member,) = lst["members"]
    assert member["photo_url"] == ANNA["photo_url"]
    assert member["first_name"] == "Анна"
    assert "telegram_id" not in member
