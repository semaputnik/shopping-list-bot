"""Purchase History: order, cursor paging, re-add (HTTP API only)."""

import pytest

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
CARLOS = {"id": 2002, "first_name": "Carlos", "language_code": "es-MX"}
EVE = {"id": 3003, "first_name": "Eve", "language_code": "en"}


@pytest.fixture
def anna(sign_in, client):
    session = sign_in(ANNA)
    lists = client.get("/api/lists", headers=session["headers"]).json()
    return {"headers": session["headers"], "list_id": lists[0]["id"]}


def lp(who):
    return f"/api/lists/{who['list_id']}"


def add(client, who, text):
    r = client.post(f"{lp(who)}/entries", json={"text": text}, headers=who["headers"])
    assert r.status_code == 201, r.text
    return r.json()["entries"]


def buy_text(client, who, text):
    """Add the Entries, check them all and press «Куплено»; returns the Purchase."""
    for e in add(client, who, text):
        r = client.patch(
            f"{lp(who)}/entries/{e['id']}", json={"checked": True}, headers=who["headers"]
        )
        assert r.status_code == 200
    r = client.post(f"{lp(who)}/purchases", headers=who["headers"])
    assert r.status_code == 201, r.text
    return r.json()


def history(client, who, **params):
    r = client.get(f"{lp(who)}/purchases", params=params, headers=who["headers"])
    assert r.status_code == 200, r.text
    return r.json()


def readd(client, who, purchase_id, item_id, **body):
    return client.post(
        f"{lp(who)}/purchases/{purchase_id}/entries/{item_id}/readd",
        json=body,
        headers=who["headers"],
    )


def on_list(client, who):
    r = client.get(f"{lp(who)}/entries", headers=who["headers"])
    return [e for g in r.json()["categories"] for e in g["entries"]]


def first_item(client, who):
    return history(client, who)["purchases"][0]["entries"][0]


def test_empty_history(client, anna):
    assert history(client, anna) == {"purchases": [], "next_cursor": None}


def test_purchase_shows_time_buyer_and_items_with_notes(client, anna):
    bought = buy_text(client, anna, "молоко, 2 л; хлеб")
    (p,) = history(client, anna)["purchases"]
    assert p["id"] == bought["id"]
    assert p["purchased_at"][:19] == bought["purchased_at"][:19]
    assert p["purchased_by"] == bought["purchased_by"]
    assert p["purchased_by_name"] == "Анна"
    assert [(e["name"], e["note"]) for e in p["entries"]] == [("молоко", "2 л"), ("хлеб", None)]


def test_purchase_shows_which_member_pressed_it(client, sign_in, anna):
    code = client.get(lp(anna), headers=anna["headers"]).json()["share_code"]
    carlos = sign_in(CARLOS)
    joined = client.post("/api/lists/join", json={"code": code}, headers=carlos["headers"])
    assert joined.status_code == 200
    carlos_on_list = {"headers": carlos["headers"], "list_id": anna["list_id"]}
    buy_text(client, anna, "хлеб")
    buy_text(client, carlos_on_list, "сыр")
    names = [p["purchased_by_name"] for p in history(client, anna)["purchases"]]
    assert names == ["Carlos", "Анна"]


def test_newest_first(client, anna):
    ids = [buy_text(client, anna, f"товар {i}")["id"] for i in range(4)]
    assert [p["id"] for p in history(client, anna)["purchases"]] == ids[::-1]


def test_cursor_pages_cover_everything_once_in_order(client, anna):
    ids = [buy_text(client, anna, f"товар {i}")["id"] for i in range(7)]
    seen, cursor, pages = [], None, 0
    while True:
        params = {"limit": 3} | ({"cursor": cursor} if cursor else {})
        page = history(client, anna, **params)
        pages += 1
        assert len(page["purchases"]) <= 3
        seen += [p["id"] for p in page["purchases"]]
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert pages == 3
    assert seen == ids[::-1]


def test_exact_page_boundary_has_no_next_cursor(client, anna):
    for i in range(3):
        buy_text(client, anna, f"товар {i}")
    page = history(client, anna, limit=3)
    assert len(page["purchases"]) == 3
    assert page["next_cursor"] is None


def test_new_purchase_does_not_shift_an_open_cursor(client, anna):
    ids = [buy_text(client, anna, f"товар {i}")["id"] for i in range(4)]
    first = history(client, anna, limit=2)
    buy_text(client, anna, "новое")
    second = history(client, anna, limit=2, cursor=first["next_cursor"])
    assert [p["id"] for p in second["purchases"]] == [ids[1], ids[0]]


def test_bad_cursor_and_limit_are_rejected(client, anna):
    bad_cursor = client.get(f"{lp(anna)}/purchases?cursor=!!!", headers=anna["headers"])
    assert bad_cursor.status_code == 422
    assert client.get(f"{lp(anna)}/purchases?limit=0", headers=anna["headers"]).status_code == 422


def test_undone_purchase_leaves_history(client, anna):
    p = buy_text(client, anna, "хлеб")
    r = client.delete(f"{lp(anna)}/purchases/{p['id']}", headers=anna["headers"])
    assert r.status_code == 200
    assert history(client, anna)["purchases"] == []


def test_history_survives_removing_product_from_memory(client, anna):
    p = buy_text(client, anna, "хлеб")
    pid = client.get(f"{lp(anna)}/products", headers=anna["headers"]).json()[0]["id"]
    assert client.delete(f"{lp(anna)}/products/{pid}", headers=anna["headers"]).status_code == 200
    assert history(client, anna)["purchases"][0]["id"] == p["id"]


def test_readd_puts_item_back_with_same_note(client, anna):
    p = buy_text(client, anna, "молоко, 2 л")
    item = first_item(client, anna)
    r = readd(client, anna, p["id"], item["id"])
    assert r.status_code == 201
    entry = r.json()["entries"][0]
    assert (entry["name"], entry["note"], entry["checked"]) == ("молоко", "2 л", False)
    assert [(e["name"], e["note"]) for e in on_list(client, anna)] == [("молоко", "2 л")]
    # The Purchase itself is untouched.
    assert len(history(client, anna)["purchases"][0]["entries"]) == 1


def test_readd_twice_makes_two_rows(client, anna):
    p = buy_text(client, anna, "хлеб")
    item = first_item(client, anna)
    readd(client, anna, p["id"], item["id"])
    readd(client, anna, p["id"], item["id"])
    assert len(on_list(client, anna)) == 2


def test_readd_bumps_version(client, anna):
    p = buy_text(client, anna, "хлеб")
    item = first_item(client, anna)
    before = client.get(lp(anna), headers=anna["headers"]).json()["version"]
    assert readd(client, anna, p["id"], item["id"]).json()["version"] > before


def test_readd_is_idempotent_with_client_id(client, anna):
    p = buy_text(client, anna, "хлеб")
    item = first_item(client, anna)
    first = readd(client, anna, p["id"], item["id"], client_id="abc")
    second = readd(client, anna, p["id"], item["id"], client_id="abc")
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["entries"][0]["id"] == second.json()["entries"][0]["id"]
    assert len(on_list(client, anna)) == 1


def test_readd_brings_a_hidden_product_back_to_memory(client, anna):
    p = buy_text(client, anna, "хлеб")
    pid = client.get(f"{lp(anna)}/products", headers=anna["headers"]).json()[0]["id"]
    client.delete(f"{lp(anna)}/products/{pid}", headers=anna["headers"])
    readd(client, anna, p["id"], first_item(client, anna)["id"])
    names = [x["name"] for x in client.get(f"{lp(anna)}/products", headers=anna["headers"]).json()]
    assert names == ["хлеб"]


def test_readd_unknown_item_is_404(client, anna):
    p = buy_text(client, anna, "хлеб")
    assert readd(client, anna, p["id"], 9999).status_code == 404
    assert readd(client, anna, 9999, 1).status_code == 404


def test_non_member_cannot_read_or_readd(client, sign_in, anna):
    p = buy_text(client, anna, "хлеб")
    item = first_item(client, anna)
    eve = sign_in(EVE)
    outsider = {"headers": eve["headers"], "list_id": anna["list_id"]}
    assert client.get(f"{lp(anna)}/purchases", headers=eve["headers"]).status_code == 404
    assert readd(client, outsider, p["id"], item["id"]).status_code == 404


def test_readd_cannot_cross_lists(client, anna):
    p = buy_text(client, anna, "хлеб")
    item = first_item(client, anna)
    other = client.post("/api/lists", json={"name": "Другой"}, headers=anna["headers"]).json()
    r = client.post(
        f"/api/lists/{other['id']}/purchases/{p['id']}/entries/{item['id']}/readd",
        json={},
        headers=anna["headers"],
    )
    assert r.status_code == 404


def test_history_requires_auth(client, anna):
    assert client.get(f"{lp(anna)}/purchases").status_code == 401
