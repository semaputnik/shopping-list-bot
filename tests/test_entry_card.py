"""The Entry card: edit the Note, move a Product to another Category, delete with Undo."""

import pytest

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
CARLOS = {"id": 2002, "first_name": "Carlos", "language_code": "es-MX"}
STRANGER = {"id": 3003, "first_name": "Eve", "language_code": "en"}


@pytest.fixture
def anna(sign_in, client):
    session = sign_in(ANNA)
    lists = client.get("/api/lists", headers=session["headers"]).json()
    return {"headers": session["headers"], "list_id": lists[0]["id"], "share": lists[0]}


def add(client, who, text):
    response = client.post(
        f"/api/lists/{who['list_id']}/entries", json={"text": text}, headers=who["headers"]
    )
    assert response.status_code == 201, response.text
    return response.json()["entries"]


def contents(client, who):
    response = client.get(f"/api/lists/{who['list_id']}/entries", headers=who["headers"])
    assert response.status_code == 200, response.text
    return response.json()


def entry_url(who, entry_id, suffix=""):
    return f"/api/lists/{who['list_id']}/entries/{entry_id}{suffix}"


def all_entries(data):
    return [e for g in data["categories"] for e in g["entries"]]


def category_of(data, entry_id):
    return next(g["key"] for g in data["categories"] for e in g["entries"] if e["id"] == entry_id)


def patch(client, who, entry_id, **body):
    return client.patch(entry_url(who, entry_id), json=body, headers=who["headers"])


class TestNote:
    def test_note_can_be_set_changed_and_cleared(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        assert milk["note"] is None

        r = patch(client, anna, milk["id"], note="2 л")
        assert r.status_code == 200, r.text
        assert r.json()["entry"]["note"] == "2 л"
        assert all_entries(contents(client, anna))[0]["note"] == "2 л"

        patch(client, anna, milk["id"], note="3 л")
        assert all_entries(contents(client, anna))[0]["note"] == "3 л"

        patch(client, anna, milk["id"], note="")
        assert all_entries(contents(client, anna))[0]["note"] is None

    def test_note_is_cleared_with_an_explicit_null(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        patch(client, anna, milk["id"], note="2 л")
        r = patch(client, anna, milk["id"], note=None)
        assert r.status_code == 200, r.text
        assert r.json()["entry"]["note"] is None
        assert all_entries(contents(client, anna))[0]["note"] is None

    def test_blank_note_is_cleared_and_text_is_trimmed(self, client, anna):
        (milk,) = add(client, anna, "молоко, 2 л")
        patch(client, anna, milk["id"], note="  крупные  ")
        assert all_entries(contents(client, anna))[0]["note"] == "крупные"
        patch(client, anna, milk["id"], note="   ")
        assert all_entries(contents(client, anna))[0]["note"] is None

    def test_note_edit_touches_only_that_entry(self, client, anna):
        first, second = add(client, anna, "молоко; молоко")
        patch(client, anna, first["id"], note="2 л")
        notes = {e["id"]: e["note"] for e in all_entries(contents(client, anna))}
        assert notes == {first["id"]: "2 л", second["id"]: None}

    def test_note_edit_bumps_the_list_version(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        before = contents(client, anna)["list"]["version"]
        r = patch(client, anna, milk["id"], note="2 л")
        assert r.json()["version"] == before + 1
        assert contents(client, anna)["list"]["version"] == before + 1

    def test_too_long_note_is_rejected(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        assert patch(client, anna, milk["id"], note="x" * 501).status_code == 422

    def test_empty_patch_changes_nothing(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        before = contents(client, anna)["list"]["version"]
        r = patch(client, anna, milk["id"])
        assert r.status_code == 200
        assert r.json()["version"] == before


class TestCategory:
    def test_category_change_moves_every_entry_of_the_product(self, client, anna):
        first, second = add(client, anna, "молоко, 1 л; молоко, 2 л")
        (bread,) = add(client, anna, "хлеб")
        assert category_of(contents(client, anna), first["id"]) == "dairy"

        r = patch(client, anna, first["id"], category="other")
        assert r.status_code == 200, r.text
        assert r.json()["entry"]["category"] == "other"

        data = contents(client, anna)
        assert category_of(data, first["id"]) == "other"
        assert category_of(data, second["id"]) == "other"
        assert category_of(data, bread["id"]) == "bread"

    def test_future_entries_of_the_product_follow_the_new_category(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        patch(client, anna, milk["id"], category="other")
        (later,) = add(client, anna, "Молоко, 1 л")
        assert later["category"] == "other"
        assert category_of(contents(client, anna), later["id"]) == "other"

    def test_new_category_survives_deleting_the_entry(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        patch(client, anna, milk["id"], category="other")
        client.delete(entry_url(anna, milk["id"]), headers=anna["headers"])
        (again,) = add(client, anna, "молоко")
        assert again["category"] == "other"

    def test_category_change_is_scoped_to_the_list_not_just_the_user(self, client, anna):
        other = client.post("/api/lists", json={"name": "Дача"}, headers=anna["headers"]).json()
        other_who = {"headers": anna["headers"], "list_id": other["id"]}
        (mine,) = add(client, anna, "молоко")
        (theirs,) = add(client, other_who, "молоко")
        patch(client, anna, mine["id"], category="other")
        assert category_of(contents(client, anna), mine["id"]) == "other"
        assert category_of(contents(client, other_who), theirs["id"]) == "dairy"
        (later,) = add(client, other_who, "молоко")
        assert later["category"] == "dairy"

    def test_category_change_is_scoped_to_the_list(self, client, anna, sign_in):
        carlos = sign_in(CARLOS)
        carlos_list = client.get("/api/lists", headers=carlos["headers"]).json()[0]["id"]
        carlos_who = {"headers": carlos["headers"], "list_id": carlos_list}
        (mine,) = add(client, anna, "молоко")
        (theirs,) = add(client, carlos_who, "молоко")
        patch(client, anna, mine["id"], category="other")
        assert category_of(contents(client, carlos_who), theirs["id"]) == "dairy"

    def test_every_listed_category_is_accepted_and_groups_the_entry(self, client, anna):
        listed = client.get("/api/categories", headers=anna["headers"]).json()
        keys = [c["key"] for c in listed]
        (milk,) = add(client, anna, "молоко")
        for key in keys:
            r = patch(client, anna, milk["id"], category=key)
            assert r.status_code == 200, (key, r.text)
            assert r.json()["entry"]["category"] == key
            assert category_of(contents(client, anna), milk["id"]) == key

    def test_guessed_categories_are_listed_categories(self, client, anna):
        keys = {c["key"] for c in client.get("/api/categories", headers=anna["headers"]).json()}
        entries = add(client, anna, "яблоки, молоко, хлеб, вода, мыло, батарейки, абракадабра")
        assert {e["category"] for e in entries} <= keys
        assert "produce" in {e["category"] for e in entries}
        assert {e["category"] for e in all_entries(contents(client, anna))} <= keys

    def test_unknown_category_is_rejected(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        for bad in ("nonsense", None):
            assert patch(client, anna, milk["id"], category=bad).status_code == 422
        assert category_of(contents(client, anna), milk["id"]) == "dairy"

    def test_note_and_category_can_change_together(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        r = patch(client, anna, milk["id"], note="2 л", category="drinks")
        assert (r.json()["entry"]["note"], r.json()["entry"]["category"]) == ("2 л", "drinks")


class TestAuthor:
    def test_entry_says_who_added_it_and_when(self, client, anna, sign_in):
        carlos = sign_in(CARLOS)
        join = client.post(
            "/api/lists/join",
            json={"code": anna["share"]["share_code"]},
            headers=carlos["headers"],
        )
        assert join.status_code == 200
        carlos_who = {"headers": carlos["headers"], "list_id": anna["list_id"]}
        add(client, anna, "молоко")
        add(client, carlos_who, "хлеб")
        by_name = {e["name"]: e for e in all_entries(contents(client, anna))}
        assert by_name["молоко"]["added_by_name"] == "Анна"
        assert by_name["хлеб"]["added_by_name"] == "Carlos"
        assert by_name["хлеб"]["created_at"]


class TestDelete:
    def test_delete_removes_the_entry_and_bumps_version(self, client, anna):
        milk, bread = add(client, anna, "молоко; хлеб")
        before = contents(client, anna)["list"]["version"]
        r = client.delete(entry_url(anna, milk["id"]), headers=anna["headers"])
        assert r.status_code == 200, r.text
        assert r.json()["version"] == before + 1
        data = contents(client, anna)
        assert [e["id"] for e in all_entries(data)] == [bread["id"]]
        assert data["list"]["version"] == before + 1

    def test_deleting_twice_is_harmless(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        first = client.delete(entry_url(anna, milk["id"]), headers=anna["headers"])
        second = client.delete(entry_url(anna, milk["id"]), headers=anna["headers"])
        assert second.status_code == 200
        assert second.json()["version"] == first.json()["version"]

    def test_undo_brings_the_entry_back_unchanged(self, client, anna):
        _, two, _ = add(client, anna, "молоко, 2 л; молоко, 3 л; хлеб")
        client.delete(entry_url(anna, two["id"]), headers=anna["headers"])
        assert two["id"] not in [e["id"] for e in all_entries(contents(client, anna))]

        r = client.post(entry_url(anna, two["id"], "/restore"), headers=anna["headers"])
        assert r.status_code == 200, r.text
        restored = r.json()["entry"]
        assert (restored["id"], restored["name"], restored["note"]) == (
            two["id"],
            two["name"],
            two["note"],
        )
        dairy = next(g for g in contents(client, anna)["categories"] if g["key"] == "dairy")
        # back in its original place among the Entries
        assert [e["note"] for e in dairy["entries"]] == ["2 л", "3 л"]

    def test_a_checked_entry_comes_back_checked(self, client, anna):
        # Undo restores the Entry exactly as it was, so the check mark survives a delete.
        (milk,) = add(client, anna, "молоко")
        client.patch(entry_url(anna, milk["id"]), json={"checked": True}, headers=anna["headers"])
        client.delete(entry_url(anna, milk["id"]), headers=anna["headers"])
        r = client.post(entry_url(anna, milk["id"], "/restore"), headers=anna["headers"])
        assert r.json()["entry"]["checked"] is True
        (back,) = all_entries(contents(client, anna))
        assert back["checked"] is True

    def test_restoring_a_live_entry_is_a_no_op(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        before = contents(client, anna)["list"]["version"]
        r = client.post(entry_url(anna, milk["id"], "/restore"), headers=anna["headers"])
        assert r.status_code == 200
        assert r.json()["version"] == before

    def test_a_deleted_entry_cannot_be_edited(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        client.delete(entry_url(anna, milk["id"]), headers=anna["headers"])
        assert patch(client, anna, milk["id"], note="x").status_code == 404

    def test_empty_list_after_deleting_the_last_entry(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        client.delete(entry_url(anna, milk["id"]), headers=anna["headers"])
        assert contents(client, anna)["categories"] == []


class TestAccess:
    def test_non_member_cannot_touch_entries(self, client, anna, sign_in):
        (milk,) = add(client, anna, "молоко")
        eve = {"headers": sign_in(STRANGER)["headers"], "list_id": anna["list_id"]}
        assert patch(client, eve, milk["id"], note="x").status_code == 404
        assert client.delete(entry_url(eve, milk["id"]), headers=eve["headers"]).status_code == 404
        restore = client.post(entry_url(eve, milk["id"], "/restore"), headers=eve["headers"])
        assert restore.status_code == 404
        assert all_entries(contents(client, anna))[0]["note"] is None

    def test_entry_of_another_list_is_not_reachable_through_this_one(self, client, anna, sign_in):
        carlos = sign_in(CARLOS)
        carlos_list = client.get("/api/lists", headers=carlos["headers"]).json()[0]["id"]
        (theirs,) = add(client, {"headers": carlos["headers"], "list_id": carlos_list}, "молоко")
        assert patch(client, anna, theirs["id"], note="x").status_code == 404
        assert (
            client.delete(entry_url(anna, theirs["id"]), headers=anna["headers"]).status_code == 404
        )

    def test_restore_through_another_lists_url_is_404(self, client, anna, sign_in):
        carlos = sign_in(CARLOS)
        carlos_list = client.get("/api/lists", headers=carlos["headers"]).json()[0]["id"]
        theirs_who = {"headers": carlos["headers"], "list_id": carlos_list}
        (theirs,) = add(client, theirs_who, "молоко")
        client.delete(entry_url(theirs_who, theirs["id"]), headers=carlos["headers"])
        r = client.post(entry_url(anna, theirs["id"], "/restore"), headers=anna["headers"])
        assert r.status_code == 404
        assert contents(client, theirs_who)["categories"] == []

    def test_unknown_entry_is_404(self, client, anna):
        assert client.delete(entry_url(anna, 9999), headers=anna["headers"]).status_code == 404

    def test_requires_sign_in(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        assert client.patch(entry_url(anna, milk["id"]), json={"note": "x"}).status_code == 401
        assert client.delete(entry_url(anna, milk["id"])).status_code == 401
        assert client.post(entry_url(anna, milk["id"], "/restore")).status_code == 401
