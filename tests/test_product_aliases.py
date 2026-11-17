"""Product aliases: other names that find a Product and add it (all through the HTTP API)."""

import pytest

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
STRANGER = {"id": 3003, "first_name": "Eve", "language_code": "en"}


@pytest.fixture
def anna(sign_in, client):
    session = sign_in(ANNA)
    lists = client.get("/api/lists", headers=session["headers"]).json()
    return {"headers": session["headers"], "list_id": lists[0]["id"]}


def add(client, who, text):
    response = client.post(
        f"/api/lists/{who['list_id']}/entries", json={"text": text}, headers=who["headers"]
    )
    assert response.status_code == 201, response.text
    return response.json()["entries"]


def alias_url(who, product_id, alias_id=None):
    base = f"/api/lists/{who['list_id']}/products/{product_id}/aliases"
    return base if alias_id is None else f"{base}/{alias_id}"


def add_alias(client, who, product_id, name):
    return client.post(alias_url(who, product_id), json={"name": name}, headers=who["headers"])


def suggest(client, who, q):
    response = client.get(
        f"/api/lists/{who['list_id']}/suggestions", params={"q": q}, headers=who["headers"]
    )
    assert response.status_code == 200, response.text
    return response.json()


def contents(client, who):
    return client.get(f"/api/lists/{who['list_id']}/entries", headers=who["headers"]).json()


def all_entries(data):
    return [e for g in data["categories"] for e in g["entries"]]


def version(client, who):
    return contents(client, who)["list"]["version"]


def products(client, who):
    return client.get(f"/api/lists/{who['list_id']}/products", headers=who["headers"]).json()


class TestAddAndRemove:
    def test_alias_is_added_and_listed_on_entries_and_products(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        assert milk["aliases"] == []

        r = add_alias(client, anna, milk["product_id"], "Milk")
        assert r.status_code == 201, r.text
        alias = {"id": r.json()["id"], "name": "Milk"}

        assert all_entries(contents(client, anna))[0]["aliases"] == [alias]
        assert [p["aliases"] for p in products(client, anna)] == [[alias]]

    def test_adding_bumps_the_version_and_removing_does_too(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        before = version(client, anna)

        r = add_alias(client, anna, milk["product_id"], "milk")
        assert r.json()["version"] == before + 1
        assert version(client, anna) == before + 1

        r = client.delete(
            alias_url(anna, milk["product_id"], r.json()["id"]), headers=anna["headers"]
        )
        assert r.status_code == 200, r.text
        assert r.json()["version"] == before + 2
        assert all_entries(contents(client, anna))[0]["aliases"] == []

    def test_the_same_alias_twice_is_idempotent(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        first = add_alias(client, anna, milk["product_id"], "Milk")
        before = version(client, anna)

        again = add_alias(client, anna, milk["product_id"], " milk ")
        assert again.status_code == 200, again.text
        assert again.json()["id"] == first.json()["id"]
        assert version(client, anna) == before
        assert len(all_entries(contents(client, anna))[0]["aliases"]) == 1

    def test_blank_alias_is_rejected(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        assert add_alias(client, anna, milk["product_id"], "  ").status_code == 422

    def test_unknown_product_or_alias_is_404(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        assert add_alias(client, anna, 999999, "milk").status_code == 404
        r = client.delete(alias_url(anna, milk["product_id"], 999999), headers=anna["headers"])
        assert r.status_code == 404

    def test_alias_is_reachable_only_through_its_own_product(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        (bread,) = add(client, anna, "хлеб")
        alias = add_alias(client, anna, milk["product_id"], "milk").json()
        r = client.delete(
            alias_url(anna, bread["product_id"], alias["id"]), headers=anna["headers"]
        )
        assert r.status_code == 404

    def test_only_members_can_add_or_remove(self, client, anna, sign_in):
        (milk,) = add(client, anna, "молоко")
        alias = add_alias(client, anna, milk["product_id"], "milk").json()
        stranger = sign_in(STRANGER)["headers"]
        url = alias_url(anna, milk["product_id"])
        assert client.post(url, json={"name": "x"}, headers=stranger).status_code == 404
        assert client.delete(f"{url}/{alias['id']}", headers=stranger).status_code == 404
        assert client.post(url, json={"name": "x"}).status_code == 401

    def test_aliases_go_with_the_product(self, client, anna):
        (milk,) = add(client, anna, "малоко")
        add_alias(client, anna, milk["product_id"], "milk")
        client.patch(
            f"/api/lists/{anna['list_id']}/products/{milk['product_id']}",
            json={"name": "молоко"},
            headers=anna["headers"],
        )
        assert [a["name"] for a in all_entries(contents(client, anna))[0]["aliases"]] == ["milk"]


class TestUniqueness:
    def test_alias_equal_to_another_products_name_is_rejected(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        add(client, anna, "Plátano")
        assert add_alias(client, anna, milk["product_id"], "platano").status_code == 409

    def test_alias_equal_to_another_products_alias_is_rejected(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        (kefir,) = add(client, anna, "кефир")
        add_alias(client, anna, milk["product_id"], "Milk")
        before = version(client, anna)
        assert add_alias(client, anna, kefir["product_id"], "milk").status_code == 409
        assert version(client, anna) == before

    def test_alias_equal_to_its_own_products_name_is_rejected(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        assert add_alias(client, anna, milk["product_id"], "МОЛОКО").status_code == 409

    def test_other_lists_do_not_collide(self, client, anna, sign_in):
        (milk,) = add(client, anna, "молоко")
        add_alias(client, anna, milk["product_id"], "milk")
        eve = sign_in(STRANGER)
        eve_list = client.get("/api/lists", headers=eve["headers"]).json()[0]
        eve_who = {"headers": eve["headers"], "list_id": eve_list["id"]}
        (other,) = add(client, eve_who, "mleko")
        assert add_alias(client, eve_who, other["product_id"], "milk").status_code == 201


class TestSuggestions:
    def test_alias_finds_the_product_under_its_canonical_name(self, client, anna):
        (milk,) = add(client, anna, "Молоко")
        add_alias(client, anna, milk["product_id"], "Milk")

        (hit,) = suggest(client, anna, "milk")
        assert hit["name"] == "Молоко"
        assert hit["product_id"] == milk["product_id"]
        assert hit["matched_alias"] == "Milk"

    def test_a_name_hit_has_no_matched_alias(self, client, anna):
        (milk,) = add(client, anna, "Молоко")
        add_alias(client, anna, milk["product_id"], "Milk")
        (hit,) = suggest(client, anna, "мол")
        assert hit["matched_alias"] is None

    def test_aliases_match_with_the_same_rules_as_names(self, client, anna):
        (banana,) = add(client, anna, "банан")
        add_alias(client, anna, banana["product_id"], "Plátano")
        assert suggest(client, anna, "PLATANO")[0]["matched_alias"] == "Plátano"  # case, accents
        assert suggest(client, anna, "plat")[0]["matched_alias"] == "Plátano"  # prefix
        assert suggest(client, anna, "platnao")[0]["matched_alias"] == "Plátano"  # a typo
        assert suggest(client, anna, "xyz") == []

    def test_a_product_is_suggested_once_even_if_name_and_alias_match(self, client, anna):
        (milk,) = add(client, anna, "milk chocolate")
        add_alias(client, anna, milk["product_id"], "milka")
        hits = suggest(client, anna, "milk")
        assert [h["product_id"] for h in hits] == [milk["product_id"]]

    def test_alias_of_a_hidden_product_does_not_suggest_it(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        add_alias(client, anna, milk["product_id"], "milk")
        client.delete(
            f"/api/lists/{anna['list_id']}/products/{milk['product_id']}", headers=anna["headers"]
        )
        assert suggest(client, anna, "milk") == []

    def test_removed_alias_stops_matching(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        alias = add_alias(client, anna, milk["product_id"], "milk").json()
        client.delete(alias_url(anna, milk["product_id"], alias["id"]), headers=anna["headers"])
        assert suggest(client, anna, "milk") == []


class TestAddingByAlias:
    def test_typing_an_alias_adds_an_entry_of_the_product_under_its_canonical_name(
        self, client, anna
    ):
        (milk,) = add(client, anna, "Молоко")
        add_alias(client, anna, milk["product_id"], "Milk")

        (entry,) = add(client, anna, "MILK, 2 л")
        assert entry["name"] == "Молоко"
        assert entry["note"] == "2 л"
        assert entry["product_id"] == milk["product_id"]
        assert len(products(client, anna)) == 1

    def test_typing_an_alias_of_a_hidden_product_brings_it_back(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        add_alias(client, anna, milk["product_id"], "milk")
        client.delete(
            f"/api/lists/{anna['list_id']}/products/{milk['product_id']}", headers=anna["headers"]
        )
        add(client, anna, "milk")
        assert [h["name"] for h in suggest(client, anna, "мол")] == ["молоко"]


class TestMergeOnRename:
    def rename(self, client, who, product_id, name):
        return client.patch(
            f"/api/lists/{who['list_id']}/products/{product_id}",
            json={"name": name},
            headers=who["headers"],
        )

    def test_merging_moves_the_sources_aliases_to_the_target(self, client, anna):
        (typo,) = add(client, anna, "малоко")
        (right,) = add(client, anna, "молоко")
        add_alias(client, anna, typo["product_id"], "milk")
        add_alias(client, anna, right["product_id"], "leche")

        r = self.rename(client, anna, typo["product_id"], "молоко")
        assert r.json()["merged"] is True

        (product,) = products(client, anna)
        assert sorted(a["name"] for a in product["aliases"]) == ["leche", "milk"]
        assert suggest(client, anna, "milk")[0]["product_id"] == right["product_id"]

    def test_renaming_onto_another_products_alias_merges_into_that_product(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        (typo,) = add(client, anna, "малоко")
        add_alias(client, anna, milk["product_id"], "milk")

        r = self.rename(client, anna, typo["product_id"], "Milk")
        assert r.status_code == 200, r.text
        assert r.json()["merged"] is True
        assert r.json()["product_id"] == milk["product_id"]
        assert r.json()["name"] == "молоко"
        (product,) = products(client, anna)
        assert product["name"] == "молоко"
        assert [a["name"] for a in product["aliases"]] == ["milk"]
        assert {e["name"] for e in all_entries(contents(client, anna))} == {"молоко"}

    def test_an_alias_that_becomes_the_products_own_name_is_dropped(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        add_alias(client, anna, milk["product_id"], "milk")
        r = self.rename(client, anna, milk["product_id"], "Milk")
        assert r.json()["merged"] is False
        (product,) = products(client, anna)
        assert product["name"] == "Milk"
        assert product["aliases"] == []
