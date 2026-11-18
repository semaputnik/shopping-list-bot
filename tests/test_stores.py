"""Stores: a List's shops, a Product's default Store, and each Member's grouping (HTTP API only)."""

import pytest

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
BORIS = {"id": 1002, "first_name": "Борис", "language_code": "ru"}
STRANGER = {"id": 3003, "first_name": "Eve", "language_code": "en"}


@pytest.fixture
def anna(sign_in, client):
    session = sign_in(ANNA)
    lists = client.get("/api/lists", headers=session["headers"]).json()
    return {"headers": session["headers"], "list": lists[0], "list_id": lists[0]["id"]}


@pytest.fixture
def boris(sign_in, add_member, anna):
    session = sign_in(BORIS)
    add_member(anna["list"], session, anna)
    return {"headers": session["headers"], "list_id": anna["list_id"]}


def contents(client, who):
    response = client.get(f"/api/lists/{who['list_id']}/entries", headers=who["headers"])
    assert response.status_code == 200, response.text
    return response.json()


def entries(data):
    return {e["name"]: e for g in data["categories"] for e in g["entries"]}


def add(client, who, text):
    response = client.post(
        f"/api/lists/{who['list_id']}/entries", json={"text": text}, headers=who["headers"]
    )
    assert response.status_code == 201, response.text
    return response.json()["entries"]


def create_store(client, who, name):
    return client.post(
        f"/api/lists/{who['list_id']}/stores", json={"name": name}, headers=who["headers"]
    )


def set_store(client, who, product_id, store_id):
    return client.put(
        f"/api/lists/{who['list_id']}/products/{product_id}/store",
        json={"store_id": store_id},
        headers=who["headers"],
    )


class TestStores:
    def test_a_new_list_has_no_stores_and_groups_by_category(self, client, anna):
        data = contents(client, anna)
        assert data["stores"] == []
        assert data["grouping"] == "category"

    def test_created_stores_are_listed_by_name_and_bump_the_version(self, client, anna):
        before = contents(client, anna)["list"]["version"]
        assert create_store(client, anna, "Mercadona").status_code == 201
        r = create_store(client, anna, "Lidl")
        assert r.status_code == 201
        assert r.json()["version"] == before + 2
        assert [s["name"] for s in contents(client, anna)["stores"]] == ["Lidl", "Mercadona"]

    def test_store_names_are_unique_per_list_ignoring_case_and_accents(self, client, anna):
        assert create_store(client, anna, "Día").status_code == 201
        assert create_store(client, anna, "  dia ").status_code == 409
        assert create_store(client, anna, "   ").status_code == 422

    def test_rename_keeps_the_store_and_checks_for_clashes(self, client, anna):
        lidl = create_store(client, anna, "Lidl").json()["store"]
        create_store(client, anna, "Mercadona")
        url = f"/api/lists/{anna['list_id']}/stores/{lidl['id']}"
        r = client.patch(url, json={"name": "LIDL Centro"}, headers=anna["headers"])
        assert r.status_code == 200, r.text
        assert r.json()["store"] == {"id": lidl["id"], "name": "LIDL Centro"}
        clash = client.patch(url, json={"name": "mercadona"}, headers=anna["headers"])
        assert clash.status_code == 409
        same = client.patch(url, json={"name": "lidl centro"}, headers=anna["headers"])
        assert same.status_code == 200  # its own name, in another case

    def test_stores_belong_to_their_list_only(self, client, anna, sign_in):
        store = create_store(client, anna, "Lidl").json()["store"]
        eve = sign_in(STRANGER)
        eve_list = client.get("/api/lists", headers=eve["headers"]).json()[0]["id"]
        url = f"/api/lists/{anna['list_id']}/stores"
        assert client.post(url, json={"name": "x"}, headers=eve["headers"]).status_code == 404
        assert contents(client, {"headers": eve["headers"], "list_id": eve_list})["stores"] == []
        product = add(client, {"headers": eve["headers"], "list_id": eve_list}, "хлеб")[0]
        r = set_store(
            client,
            {"headers": eve["headers"], "list_id": eve_list},
            product["product_id"],
            store["id"],
        )
        assert r.status_code == 404  # another List's Store


class TestProductStore:
    def test_a_products_store_shows_on_every_entry_of_it(self, client, anna):
        store = create_store(client, anna, "Mercadona").json()["store"]
        first = add(client, anna, "молоко")[0]
        add(client, anna, "молоко, 2 л; хлеб")
        r = set_store(client, anna, first["product_id"], store["id"])
        assert r.status_code == 200, r.text
        data = contents(client, anna)
        stores = [
            e["store_id"] for g in data["categories"] for e in g["entries"] if e["name"] == "молоко"
        ]
        assert stores == [store["id"], store["id"]]
        assert entries(data)["хлеб"]["store_id"] is None

    def test_clearing_the_store_and_setting_it_twice(self, client, anna):
        store = create_store(client, anna, "Lidl").json()["store"]
        product = add(client, anna, "яйца")[0]["product_id"]
        first = set_store(client, anna, product, store["id"]).json()
        again = set_store(client, anna, product, store["id"]).json()
        assert again["version"] == first["version"]  # no change, no bump
        cleared = set_store(client, anna, product, None)
        assert cleared.json()["store_id"] is None
        assert entries(contents(client, anna))["яйца"]["store_id"] is None

    def test_deleting_a_store_keeps_its_products_without_a_store(self, client, anna):
        store = create_store(client, anna, "Dia").json()["store"]
        product = add(client, anna, "сыр")[0]["product_id"]
        set_store(client, anna, product, store["id"])
        r = client.delete(
            f"/api/lists/{anna['list_id']}/stores/{store['id']}", headers=anna["headers"]
        )
        assert r.status_code == 200, r.text
        data = contents(client, anna)
        assert data["stores"] == []
        assert entries(data)["сыр"]["store_id"] is None

    def test_a_merge_keeps_the_targets_store_or_takes_the_sources(self, client, anna):
        store = create_store(client, anna, "Lidl").json()["store"]
        typo = add(client, anna, "малоко")[0]["product_id"]
        right = add(client, anna, "молоко")[0]["product_id"]
        set_store(client, anna, typo, store["id"])
        r = client.patch(
            f"/api/lists/{anna['list_id']}/products/{typo}",
            json={"name": "молоко"},
            headers=anna["headers"],
        )
        assert r.json()["product_id"] == right
        assert entries(contents(client, anna))["молоко"]["store_id"] == store["id"]


class TestGrouping:
    def test_grouping_is_personal_and_does_not_bump_the_version(self, client, anna, boris):
        before = contents(client, anna)["list"]["version"]
        r = client.put(
            f"/api/lists/{anna['list_id']}/grouping",
            json={"grouping": "store"},
            headers=anna["headers"],
        )
        assert r.status_code == 200, r.text
        assert contents(client, anna)["grouping"] == "store"
        assert contents(client, anna)["list"]["version"] == before
        assert contents(client, boris)["grouping"] == "category"

    def test_only_known_groupings_are_accepted(self, client, anna):
        r = client.put(
            f"/api/lists/{anna['list_id']}/grouping",
            json={"grouping": "aisle"},
            headers=anna["headers"],
        )
        assert r.status_code == 422

    def test_another_members_store_change_reaches_the_catch_up(self, client, anna, boris):
        since = contents(client, boris)["list"]["version"]
        create_store(client, anna, "Mercadona")
        changes = client.get(
            f"/api/lists/{anna['list_id']}/changes",
            params={"since": since},
            headers=boris["headers"],
        ).json()
        assert [c["kind"] for c in changes["changes"]] == ["store.created"]
