"""Adding Entries through the input line, grouped by Category (all through the HTTP API)."""

import pytest

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
CARLOS = {"id": 2002, "first_name": "Carlos", "language_code": "es-MX"}


@pytest.fixture
def anna(sign_in, client):
    session = sign_in(ANNA)
    lists = client.get("/api/lists", headers=session["headers"]).json()
    return {"headers": session["headers"], "list_id": lists[0]["id"]}


def add(client, who, text, **extra):
    return client.post(
        f"/api/lists/{who['list_id']}/entries",
        json={"text": text, **extra},
        headers=who["headers"],
    )


def pairs(response):
    assert response.status_code == 201, response.text
    return [(e["name"], e["note"]) for e in response.json()["entries"]]


def contents(client, who):
    response = client.get(f"/api/lists/{who['list_id']}/entries", headers=who["headers"])
    assert response.status_code == 200, response.text
    return response.json()


class TestParsing:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("молоко", [("молоко", None)]),
            ("  молоко  ", [("молоко", None)]),
            ("молоко, 2 л", [("молоко", "2 л")]),
            ("молоко,2 л", [("молоко", "2 л")]),
            ("молоко, крупные, 2 шт", [("молоко", "крупные, 2 шт")]),
            ("молоко; хлеб; яйца", [("молоко", None), ("хлеб", None), ("яйца", None)]),
            ("молоко\nхлеб", [("молоко", None), ("хлеб", None)]),
            ("молоко\r\nхлеб\r\n", [("молоко", None), ("хлеб", None)]),
            ("молоко;; ;хлеб;", [("молоко", None), ("хлеб", None)]),
            ("молоко, 2 л; хлеб, 1", [("молоко", "2 л"), ("хлеб", "1")]),
            ("молоко;яйца 10", [("молоко", None), ("яйца", "10")]),
            ("2 молока", [("молока", "2")]),
            ("молоко 2", [("молоко", "2")]),
            ("колбаса 0.5", [("колбаса", "0.5")]),
            # decimal commas do not split the name from the Note
            ("вода 1,5 л", [("вода", "1,5 л")]),
            ("колбаса 0,5", [("колбаса", "0,5")]),
            ("1,5 молока", [("молока", "1,5")]),
            ("молоко, 1,5 л", [("молоко", "1,5 л")]),
            ("молоко 1,5, жирное", [("молоко", "1,5, жирное")]),
            # a trailing <number> <unit> tail moves into the Note
            ("молоко 2 л", [("молоко", "2 л")]),
            ("молоко 2л", [("молоко", "2л")]),
            ("яйца 10 шт", [("яйца", "10 шт")]),
            ("agua 1.5 L", [("agua", "1.5 L")]),
            ("2 л", [("2 л", None)]),
            # a name-less chunk is kept as typed
            (", 2 л", [("2 л", None)]),
            ("молоко 2, жирное", [("молоко", "2, жирное")]),
            # ambiguous numbers stay in the name
            ("7", [("7", None)]),
            ("2 молока 3", [("2 молока 3", None)]),
            ("2 3 яблока", [("2 3 яблока", None)]),
            ("яблока 2 3", [("яблока 2 3", None)]),
            ("7up", [("7up", None)]),
            ("2л молока", [("2л молока", None)]),
            ("coca-cola 2", [("coca-cola", "2")]),
        ],
    )
    def test_input_is_split_into_names_and_notes(self, client, anna, text, expected):
        assert pairs(add(client, anna, text)) == expected

    def test_multiline_paste_adds_every_line(self, client, anna):
        pasted = "Молоко, 2 л\nХлеб\n\nЯйца 10\nСыр; Бананы\n"
        assert pairs(add(client, anna, pasted)) == [
            ("Молоко", "2 л"),
            ("Хлеб", None),
            ("Яйца", "10"),
            ("Сыр", None),
            ("Бананы", None),
        ]
        keys = [g["key"] for g in contents(client, anna)["categories"]]
        assert keys == ["produce", "bread", "dairy"]

    @pytest.mark.parametrize("text", ["", "   ", ";;;", "\n\n", " , "])
    def test_input_without_items_is_rejected(self, client, anna, text):
        assert add(client, anna, text).status_code == 422
        assert contents(client, anna)["categories"] == []

    def test_too_many_items_in_one_request_are_rejected(self, client, anna):
        assert add(client, anna, ";".join(f"item{i}" for i in range(101))).status_code == 422

    def test_adding_never_asks_for_category_amount_or_store(self, client, anna):
        response = add(client, anna, "что-то непонятное")
        assert response.status_code == 201
        assert response.json()["entries"][0]["category"] == "uncategorized"


class TestEntryDetails:
    def test_entry_records_who_added_it_and_when(self, client, sign_in, anna):
        me = client.get("/api/me", headers=anna["headers"]).json()
        entry = add(client, anna, "молоко").json()["entries"][0]
        assert entry["added_by"] == me["id"]
        assert entry["created_at"]
        assert entry["id"]

    def test_name_and_note_are_truncated(self, client, anna):
        entry = add(client, anna, "я" * 300 + ", " + "н" * 700).json()["entries"][0]
        assert entry["name"] == "я" * 200
        assert entry["note"] == "н" * 500

    def test_rejected_add_leaves_the_version_alone(self, client, anna):
        path = f"/api/lists/{anna['list_id']}"
        before = client.get(path, headers=anna["headers"]).json()["version"]
        assert add(client, anna, " ; ").status_code == 422
        assert add(client, anna, ";".join(f"item{i}" for i in range(101))).status_code == 422
        assert client.get(path, headers=anna["headers"]).json()["version"] == before

    def test_adding_bumps_the_list_version(self, client, anna):
        before = client.get(f"/api/lists/{anna['list_id']}", headers=anna["headers"]).json()
        first = add(client, anna, "молоко").json()["version"]
        second = add(client, anna, "хлеб; яйца").json()["version"]
        assert before["version"] < first < second
        after = client.get(f"/api/lists/{anna['list_id']}", headers=anna["headers"]).json()
        assert after["version"] == second

    def test_non_member_cannot_read_or_add(self, client, sign_in, anna):
        stranger = sign_in(CARLOS)
        path = f"/api/lists/{anna['list_id']}/entries"
        assert client.get(path, headers=stranger["headers"]).status_code == 404
        response = client.post(path, json={"text": "молоко"}, headers=stranger["headers"])
        assert response.status_code == 404
        assert contents(client, anna)["categories"] == []

    def test_unauthenticated_request_is_rejected(self, client, anna):
        path = f"/api/lists/{anna['list_id']}/entries"
        assert client.post(path, json={"text": "молоко"}).status_code == 401
        assert client.get(path).status_code == 401


class TestProductMemory:
    def test_first_add_creates_a_product_and_the_name_is_reused(self, client, anna):
        first = add(client, anna, "молоко").json()["entries"][0]
        again = add(client, anna, "Молоко").json()["entries"][0]
        other = add(client, anna, "хлеб").json()["entries"][0]
        assert first["product_id"] == again["product_id"]
        assert other["product_id"] != first["product_id"]

    def test_names_match_without_case_diacritics_or_extra_spaces(self, client, anna):
        a = add(client, anna, "plátano").json()["entries"][0]
        b = add(client, anna, "  PLATANO ").json()["entries"][0]
        assert a["product_id"] == b["product_id"]

    def test_products_are_scoped_to_one_list(self, client, sign_in, anna):
        carlos = sign_in(CARLOS)
        carlos_list = client.get("/api/lists", headers=carlos["headers"]).json()[0]["id"]
        carlos_ctx = {"headers": carlos["headers"], "list_id": carlos_list}
        mine = add(client, anna, "молоко").json()["entries"][0]
        theirs = add(client, carlos_ctx, "молоко").json()["entries"][0]
        assert mine["product_id"] != theirs["product_id"]


class TestDuplicates:
    def test_adding_a_name_already_on_the_list_creates_a_second_entry(self, client, anna):
        add(client, anna, "молоко, 1 л")
        add(client, anna, "молоко, 2 л")
        entries = contents(client, anna)["categories"][0]["entries"]
        assert [(e["name"], e["note"]) for e in entries] == [("молоко", "1 л"), ("молоко", "2 л")]
        assert entries[0]["id"] != entries[1]["id"]

    def test_duplicates_within_one_line_all_stand(self, client, anna):
        assert len(add(client, anna, "хлеб; хлеб; хлеб").json()["entries"]) == 3
        assert contents(client, anna)["categories"][0]["count"] == 3


class TestCategories:
    @pytest.mark.parametrize(
        ("name", "category"),
        [
            ("яблоки", "produce"),
            ("Помидоры черри", "produce"),
            ("картошка", "produce"),
            ("хлеб", "bread"),
            ("батон", "bread"),
            ("молоко", "dairy"),
            ("Молока", "dairy"),
            ("яйца", "dairy"),
            ("сыр", "dairy"),
            ("масло сливочное", "dairy"),
            ("масло подсолнечное", "pantry"),
            ("курица", "meat_fish"),
            ("лосось", "meat_fish"),
            ("пельмени", "frozen"),
            ("мороженое", "frozen"),
            ("гречка", "pantry"),
            ("печенье", "pantry"),
            ("вода", "drinks"),
            ("Кока-кола", "drinks"),
            ("порошок стиральный", "household"),
            ("шампунь", "hygiene"),
            ("туалетная бумага", "hygiene"),
            ("батарейки", "other"),
            # Spanish, with and without diacritics
            ("plátano", "produce"),
            ("platano", "produce"),
            ("Manzanas", "produce"),
            ("pan", "bread"),
            ("leche", "dairy"),
            ("huevos", "dairy"),
            ("jamón", "meat_fish"),
            ("jamon", "meat_fish"),
            ("helado", "frozen"),
            ("arroz", "pantry"),
            ("aceite de oliva", "pantry"),
            ("cerveza", "drinks"),
            ("lejía", "household"),
            ("champú", "hygiene"),
            ("pilas", "other"),
            # unknown names
            ("qwertyuiop", "uncategorized"),
            ("что-то", "uncategorized"),
        ],
    )
    def test_category_is_guessed_from_the_ru_es_dictionary(self, client, anna, name, category):
        assert add(client, anna, name).json()["entries"][0]["category"] == category

    def test_headers_have_emoji_name_and_count_in_the_fixed_order(self, client, anna):
        add(client, anna, "qwerty; шампунь; вода; молоко; молоко 2; яблоки; хлеб; курица")
        groups = contents(client, anna)["categories"]
        assert [g["key"] for g in groups] == [
            "produce",
            "bread",
            "dairy",
            "meat_fish",
            "drinks",
            "hygiene",
            "uncategorized",
        ]
        dairy = groups[2]
        assert dairy["count"] == 2
        assert len(dairy["entries"]) == 2
        assert dairy["emoji"] == "🥛"
        assert dairy["name"] == "Молочное"
        assert groups[-1]["name"] == "Без категории"
        assert all(g["emoji"] for g in groups)

    def test_the_order_does_not_depend_on_the_order_of_adding(self, client, anna):
        add(client, anna, "qwerty")
        add(client, anna, "вода")
        add(client, anna, "яблоки")
        keys = [g["key"] for g in contents(client, anna)["categories"]]
        assert keys == ["produce", "drinks", "uncategorized"]

    def test_category_names_follow_the_interface_language(self, client, sign_in):
        carlos = sign_in(CARLOS)
        carlos_list = client.get("/api/lists", headers=carlos["headers"]).json()[0]["id"]
        ctx = {"headers": carlos["headers"], "list_id": carlos_list}
        add(client, ctx, "leche; qwerty")
        names = [g["name"] for g in contents(client, ctx)["categories"]]
        assert names == ["Lácteos", "Sin categoría"]

    def test_empty_list_has_no_groups(self, client, anna):
        assert contents(client, anna)["categories"] == []

    def test_entries_inside_a_category_keep_the_order_of_adding(self, client, anna):
        add(client, anna, "яблоки")
        add(client, anna, "груши")
        add(client, anna, "бананы")
        names = [e["name"] for e in contents(client, anna)["categories"][0]["entries"]]
        assert names == ["яблоки", "груши", "бананы"]


class TestIdempotency:
    def test_replaying_a_client_id_does_not_duplicate_entries(self, client, anna):
        first = add(client, anna, "молоко; хлеб", client_id="op-1")
        replay = add(client, anna, "молоко; хлеб", client_id="op-1")
        assert first.status_code == 201
        assert replay.status_code == 200
        assert [e["id"] for e in replay.json()["entries"]] == [
            e["id"] for e in first.json()["entries"]
        ]
        assert replay.json()["version"] == first.json()["version"]
        assert sum(g["count"] for g in contents(client, anna)["categories"]) == 2

    def test_different_client_ids_are_different_operations(self, client, anna):
        add(client, anna, "молоко", client_id="op-1")
        add(client, anna, "молоко", client_id="op-2")
        assert contents(client, anna)["categories"][0]["count"] == 2

    def test_client_ids_are_scoped_to_the_list(self, client, sign_in, anna):
        carlos = sign_in(CARLOS)
        carlos_list = client.get("/api/lists", headers=carlos["headers"]).json()[0]["id"]
        ctx = {"headers": carlos["headers"], "list_id": carlos_list}
        assert add(client, anna, "молоко", client_id="op-1").status_code == 201
        assert add(client, ctx, "молоко", client_id="op-1").status_code == 201
