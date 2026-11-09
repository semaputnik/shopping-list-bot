import pytest

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
BORIS = {"id": 1002, "first_name": "Борис", "language_code": "ru"}


def names(client, headers):
    return [lst["name"] for lst in client.get("/api/lists", headers=headers).json()]


def create(client, headers, name):
    response = client.post("/api/lists", json={"name": name}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def anna(sign_in):
    return sign_in(ANNA)


@pytest.fixture
def boris(sign_in):
    return sign_in(BORIS)


class TestCreateAndRename:
    def test_created_list_belongs_to_its_creator(self, client, anna):
        lst = create(client, anna["headers"], "  Дача  ")
        assert lst["name"] == "Дача"
        assert lst["member_count"] == 1
        assert "Дача" in names(client, anna["headers"])

    @pytest.mark.parametrize("name", ["", "   ", "x" * 201])
    def test_invalid_name_is_rejected(self, client, anna, name):
        response = client.post("/api/lists", json={"name": name}, headers=anna["headers"])
        assert response.status_code == 422

    def test_creating_requires_a_session(self, client):
        assert client.post("/api/lists", json={"name": "x"}).status_code == 401

    def test_any_member_can_rename(self, client, anna, boris, add_member):
        lst = create(client, anna["headers"], "Дача")
        add_member(lst["id"], boris["response"]["user"]["id"])
        response = client.patch(
            f"/api/lists/{lst['id']}", json={"name": "Дом"}, headers=boris["headers"]
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Дом"
        assert response.json()["version"] > lst["version"]
        seen = client.get(f"/api/lists/{lst['id']}", headers=anna["headers"]).json()
        assert seen["name"] == "Дом"

    def test_rename_with_empty_name_is_rejected(self, client, anna):
        lst = create(client, anna["headers"], "Дача")
        response = client.patch(
            f"/api/lists/{lst['id']}", json={"name": " "}, headers=anna["headers"]
        )
        assert response.status_code == 422

    def test_rename_with_too_long_name_is_rejected(self, client, anna):
        lst = create(client, anna["headers"], "Дача")
        response = client.patch(
            f"/api/lists/{lst['id']}", json={"name": "x" * 201}, headers=anna["headers"]
        )
        assert response.status_code == 422

    def test_mutations_require_a_session(self, client, anna):
        lst = create(client, anna["headers"], "Дача")
        url = f"/api/lists/{lst['id']}"
        assert client.patch(url, json={"name": "x"}).status_code == 401
        assert client.post(f"{url}/leave").status_code == 401
        assert client.delete(url).status_code == 401
        assert names(client, anna["headers"]).count("Дача") == 1

    def test_non_member_cannot_rename(self, client, anna, boris):
        lst = create(client, anna["headers"], "Дача")
        response = client.patch(
            f"/api/lists/{lst['id']}", json={"name": "Моё"}, headers=boris["headers"]
        )
        assert response.status_code == 404
        seen = client.get(f"/api/lists/{lst['id']}", headers=anna["headers"]).json()
        assert seen["name"] == "Дача"


class TestOrdering:
    def test_lists_are_ordered_by_most_recent_change(self, client, anna):
        h = anna["headers"]
        first = create(client, h, "A")
        create(client, h, "B")
        create(client, h, "C")
        assert names(client, h)[:3] == ["C", "B", "A"]
        client.patch(f"/api/lists/{first['id']}", json={"name": "A2"}, headers=h)
        assert names(client, h)[:3] == ["A2", "C", "B"]

    def test_leaving_counts_as_a_change_for_the_remaining_members(
        self, client, anna, boris, add_member
    ):
        h = anna["headers"]
        shared = create(client, h, "Дача")
        create(client, h, "Дом")
        assert names(client, h)[:2] == ["Дом", "Дача"]
        add_member(shared["id"], boris["response"]["user"]["id"])
        before = client.get(f"/api/lists/{shared['id']}", headers=h).json()["version"]

        client.post(f"/api/lists/{shared['id']}/leave", headers=boris["headers"])

        after = client.get(f"/api/lists/{shared['id']}", headers=h).json()["version"]
        assert after == before + 1
        assert names(client, h)[:2] == ["Дача", "Дом"]

    def test_each_user_sees_only_their_lists(self, client, anna, boris):
        create(client, anna["headers"], "Секрет")
        assert "Секрет" not in names(client, boris["headers"])


class TestLeave:
    def test_leaving_removes_the_list_for_that_user_only(self, client, anna, boris, add_member):
        lst = create(client, anna["headers"], "Дача")
        add_member(lst["id"], boris["response"]["user"]["id"])
        assert (
            client.get(f"/api/lists/{lst['id']}", headers=boris["headers"]).json()["member_count"]
            == 2
        )

        response = client.post(f"/api/lists/{lst['id']}/leave", headers=boris["headers"])
        assert response.status_code == 204
        assert "Дача" not in names(client, boris["headers"])
        assert client.get(f"/api/lists/{lst['id']}", headers=boris["headers"]).status_code == 404
        remaining = client.get(f"/api/lists/{lst['id']}", headers=anna["headers"]).json()
        assert remaining["member_count"] == 1

    def test_leaving_twice_is_not_found(self, client, anna, boris, add_member):
        lst = create(client, anna["headers"], "Дача")
        add_member(lst["id"], boris["response"]["user"]["id"])
        client.post(f"/api/lists/{lst['id']}/leave", headers=boris["headers"])
        again = client.post(f"/api/lists/{lst['id']}/leave", headers=boris["headers"])
        assert again.status_code == 404

    def test_last_member_leaving_deletes_the_list(self, client, anna, count_rows):
        lst = create(client, anna["headers"], "Дача")
        before = count_rows("list")
        response = client.post(f"/api/lists/{lst['id']}/leave", headers=anna["headers"])
        assert response.status_code == 204
        assert count_rows("list") == before - 1
        assert "Дача" not in names(client, anna["headers"])

    def test_leaving_a_list_one_is_not_in_is_not_found(self, client, anna, boris):
        lst = create(client, anna["headers"], "Дача")
        response = client.post(f"/api/lists/{lst['id']}/leave", headers=boris["headers"])
        assert response.status_code == 404
        assert "Дача" in names(client, anna["headers"])


class TestDelete:
    def test_any_member_deletes_the_list_for_everyone(
        self, client, anna, boris, add_member, count_rows
    ):
        lst = create(client, anna["headers"], "Дача")
        add_member(lst["id"], boris["response"]["user"]["id"])
        members_before = count_rows("list_member")

        response = client.delete(f"/api/lists/{lst['id']}", headers=boris["headers"])
        assert response.status_code == 204
        for who in (anna, boris):
            assert "Дача" not in names(client, who["headers"])
            assert client.get(f"/api/lists/{lst['id']}", headers=who["headers"]).status_code == 404
        # The cascade took the memberships with it.
        assert count_rows("list_member") == members_before - 2

    def test_non_member_cannot_delete(self, client, anna, boris):
        lst = create(client, anna["headers"], "Дача")
        assert client.delete(f"/api/lists/{lst['id']}", headers=boris["headers"]).status_code == 404
        assert "Дача" in names(client, anna["headers"])

    def test_deleting_one_list_leaves_the_others(self, client, anna):
        h = anna["headers"]
        keep = create(client, h, "Остаётся")
        gone = create(client, h, "Уходит")
        client.delete(f"/api/lists/{gone['id']}", headers=h)
        assert client.get(f"/api/lists/{keep['id']}", headers=h).status_code == 200
