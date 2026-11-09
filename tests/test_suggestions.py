"""Suggestions from the List's memory (all through the HTTP API)."""

import pytest

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
BORIS = {"id": 3003, "first_name": "Борис", "language_code": "ru"}


@pytest.fixture
def anna(sign_in, client):
    session = sign_in(ANNA)
    lists = client.get("/api/lists", headers=session["headers"]).json()
    return {"headers": session["headers"], "list_id": lists[0]["id"]}


@pytest.fixture
def boris(sign_in, client):
    session = sign_in(BORIS)
    lists = client.get("/api/lists", headers=session["headers"]).json()
    return {"headers": session["headers"], "list_id": lists[0]["id"]}


def add(client, who, text):
    response = client.post(
        f"/api/lists/{who['list_id']}/entries", json={"text": text}, headers=who["headers"]
    )
    assert response.status_code == 201, response.text
    return response.json()


def suggest(client, who, q):
    response = client.get(
        f"/api/lists/{who['list_id']}/suggestions", params={"q": q}, headers=who["headers"]
    )
    assert response.status_code == 200, response.text
    return response.json()


def names(suggestions):
    return [s["name"] for s in suggestions]


def hide(client, who, product_id):
    return client.delete(
        f"/api/lists/{who['list_id']}/products/{product_id}", headers=who["headers"]
    )


class TestScoping:
    def test_only_this_lists_products_are_suggested(self, client, anna, boris):
        add(client, anna, "молоко")
        add(client, boris, "морковь")
        assert names(suggest(client, anna, "м")) == ["молоко"]
        assert names(suggest(client, boris, "м")) == ["морковь"]

    def test_non_member_gets_404(self, client, anna, boris):
        response = client.get(
            f"/api/lists/{anna['list_id']}/suggestions",
            params={"q": "м"},
            headers=boris["headers"],
        )
        assert response.status_code == 404

    def test_requires_authentication(self, client, anna):
        response = client.get(f"/api/lists/{anna['list_id']}/suggestions", params={"q": "м"})
        assert response.status_code == 401

    def test_blank_query_suggests_nothing(self, client, anna):
        add(client, anna, "молоко")
        assert suggest(client, anna, "") == []
        assert suggest(client, anna, "   ") == []


class TestMatching:
    def test_ignores_case(self, client, anna):
        add(client, anna, "Молоко")
        assert names(suggest(client, anna, "МОЛО")) == ["Молоко"]

    def test_ignores_diacritics_both_ways(self, client, anna):
        add(client, anna, "plátano")
        assert names(suggest(client, anna, "platano")) == ["plátano"]
        add(client, anna, "Jamon")
        assert names(suggest(client, anna, "jamón")) == ["Jamon"]

    def test_tolerates_one_typo(self, client, anna):
        add(client, anna, "молоко")
        assert names(suggest(client, anna, "малоко")) == ["молоко"]

    def test_typo_by_swap_and_missing_letter(self, client, anna):
        add(client, anna, "молоко")
        assert names(suggest(client, anna, "мололо")) == ["молоко"]
        assert names(suggest(client, anna, "молко")) == ["молоко"]
        assert names(suggest(client, anna, "омлоко")) == ["молоко"]

    def test_typo_while_still_typing(self, client, anna):
        add(client, anna, "молоко")
        assert names(suggest(client, anna, "малок")) == ["молоко"]

    def test_two_typos_do_not_match(self, client, anna):
        add(client, anna, "молоко")
        assert suggest(client, anna, "малако") == []

    def test_unrelated_text_does_not_match(self, client, anna):
        add(client, anna, "молоко")
        assert suggest(client, anna, "хлеб") == []

    def test_substring_matches_inside_a_name(self, client, anna):
        add(client, anna, "кокосовое молоко")
        assert names(suggest(client, anna, "молоко")) == ["кокосовое молоко"]


class TestRanking:
    def test_exact_then_prefix_then_substring_then_typo(self, client, anna):
        add(client, anna, "малоко; кокосовое молоко; молоко сухое; молоко")
        assert names(suggest(client, anna, "молоко")) == [
            "молоко",
            "молоко сухое",
            "кокосовое молоко",
            "малоко",
        ]

    def test_equal_matches_are_ordered_deterministically(self, client, anna):
        # Purchase counts only change on «Куплено» (a later ticket); until then every Product
        # has 0, so ties fall back to the name. The count tie-break itself is in suggest.rank.
        add(client, anna, "молоко Б; молоко А")
        assert names(suggest(client, anna, "молоко")) == ["молоко А", "молоко Б"]


class TestOnListFlag:
    def test_flag_is_set_for_products_on_the_list(self, client, anna):
        add(client, anna, "молоко")
        [s] = suggest(client, anna, "мол")
        assert s["on_list"] is True

    def test_adding_a_duplicate_still_works(self, client, anna):
        add(client, anna, "молоко")
        add(client, anna, "молоко")
        contents = client.get(
            f"/api/lists/{anna['list_id']}/entries", headers=anna["headers"]
        ).json()
        assert contents["categories"][0]["count"] == 2
        assert len(suggest(client, anna, "молоко")) == 1


class TestHiding:
    def test_hidden_product_is_not_suggested(self, client, anna):
        added = add(client, anna, "молоко; хлеб")
        assert hide(client, anna, added["entries"][0]["product_id"]).status_code == 200
        assert suggest(client, anna, "мол") == []
        assert names(suggest(client, anna, "хл")) == ["хлеб"]

    def test_entries_remain_when_a_product_is_hidden(self, client, anna):
        added = add(client, anna, "молоко")
        hide(client, anna, added["entries"][0]["product_id"])
        contents = client.get(
            f"/api/lists/{anna['list_id']}/entries", headers=anna["headers"]
        ).json()
        assert [e["name"] for g in contents["categories"] for e in g["entries"]] == ["молоко"]

    def test_entering_the_name_again_brings_it_back(self, client, anna):
        pid = add(client, anna, "молоко")["entries"][0]["product_id"]
        hide(client, anna, pid)
        again = add(client, anna, "Молоко")
        assert again["entries"][0]["product_id"] == pid
        assert names(suggest(client, anna, "мол")) == ["молоко"]

    def test_hiding_twice_is_harmless(self, client, anna):
        pid = add(client, anna, "молоко")["entries"][0]["product_id"]
        assert hide(client, anna, pid).status_code == 200
        assert hide(client, anna, pid).status_code == 200

    def test_hiding_bumps_the_version(self, client, anna):
        added = add(client, anna, "молоко")
        response = hide(client, anna, added["entries"][0]["product_id"])
        assert response.json()["version"] > added["version"]

    def test_cannot_hide_a_product_of_another_list(self, client, anna, boris):
        pid = add(client, anna, "молоко")["entries"][0]["product_id"]
        assert hide(client, boris, pid).status_code == 404
        assert names(suggest(client, anna, "мол")) == ["молоко"]

    def test_non_member_cannot_hide(self, client, anna, boris):
        pid = add(client, anna, "молоко")["entries"][0]["product_id"]
        response = client.delete(
            f"/api/lists/{anna['list_id']}/products/{pid}", headers=boris["headers"]
        )
        assert response.status_code == 404
