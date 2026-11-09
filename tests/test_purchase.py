"""«Куплено» and its Undo (HTTP API only)."""

import pytest

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
CARLOS = {"id": 2002, "first_name": "Carlos", "language_code": "es-MX"}
EVE = {"id": 3003, "first_name": "Eve", "language_code": "en"}


@pytest.fixture
def anna(sign_in, client):
    session = sign_in(ANNA)
    lists = client.get("/api/lists", headers=session["headers"]).json()
    return {"headers": session["headers"], "list_id": lists[0]["id"]}


def add(client, who, text):
    r = client.post(
        f"/api/lists/{who['list_id']}/entries", json={"text": text}, headers=who["headers"]
    )
    assert r.status_code == 201, r.text
    return r.json()["entries"]


def check(client, who, entry_id, checked=True):
    r = client.patch(
        f"/api/lists/{who['list_id']}/entries/{entry_id}",
        json={"checked": checked},
        headers=who["headers"],
    )
    assert r.status_code == 200, r.text


def buy(client, who):
    return client.post(f"/api/lists/{who['list_id']}/purchases", headers=who["headers"])


def undo(client, who, purchase_id):
    return client.delete(
        f"/api/lists/{who['list_id']}/purchases/{purchase_id}", headers=who["headers"]
    )


def entries(client, who):
    r = client.get(f"/api/lists/{who['list_id']}/entries", headers=who["headers"])
    return [e for g in r.json()["categories"] for e in g["entries"]]


def products(client, who):
    r = client.get(f"/api/lists/{who['list_id']}/products", headers=who["headers"])
    return {p["name"]: p for p in r.json()}


def test_buy_removes_checked_and_keeps_unchecked(client, anna):
    milk, _bread, eggs = add(client, anna, "молоко, 2 л; хлеб; яйца")
    check(client, anna, milk["id"])
    check(client, anna, eggs["id"])
    r = buy(client, anna)
    assert r.status_code == 201
    assert r.json()["count"] == 2
    assert [e["name"] for e in entries(client, anna)] == ["хлеб"]


def test_buy_with_nothing_checked_is_rejected(client, anna):
    add(client, anna, "хлеб")
    assert buy(client, anna).status_code == 409
    assert len(entries(client, anna)) == 1


def test_buy_bumps_list_version(client, anna):
    (milk,) = add(client, anna, "молоко")
    check(client, anna, milk["id"])
    before = client.get(f"/api/lists/{anna['list_id']}", headers=anna["headers"]).json()["version"]
    assert buy(client, anna).json()["version"] > before


def test_stats_change_on_buy_not_on_check(client, anna):
    (milk,) = add(client, anna, "молоко")
    check(client, anna, milk["id"])
    assert products(client, anna)["молоко"]["purchase_count"] == 0
    assert products(client, anna)["молоко"]["last_purchased_at"] is None
    buy(client, anna)
    stats = products(client, anna)["молоко"]
    assert stats["purchase_count"] == 1
    assert stats["last_purchased_at"] is not None


def test_duplicate_entries_count_each(client, anna):
    a, b = add(client, anna, "молоко; молоко")
    check(client, anna, a["id"])
    check(client, anna, b["id"])
    buy(client, anna)
    assert products(client, anna)["молоко"]["purchase_count"] == 2


def test_unchecked_entries_do_not_touch_stats(client, anna):
    milk, _bread = add(client, anna, "молоко; хлеб")
    check(client, anna, milk["id"])
    buy(client, anna)
    assert products(client, anna)["хлеб"]["purchase_count"] == 0


def test_undo_restores_entries_checked_and_rolls_back_stats(client, anna):
    milk, _bread = add(client, anna, "молоко, 2 л; хлеб")
    check(client, anna, milk["id"])
    purchase = buy(client, anna).json()
    r = undo(client, anna, purchase["id"])
    assert r.status_code == 200
    assert r.json()["restored"] == 1
    restored = {e["name"]: e for e in entries(client, anna)}
    assert set(restored) == {"молоко", "хлеб"}
    assert restored["молоко"]["checked"] is True
    assert restored["молоко"]["note"] == "2 л"
    assert restored["хлеб"]["checked"] is False
    stats = products(client, anna)["молоко"]
    assert stats["purchase_count"] == 0
    assert stats["last_purchased_at"] is None


def test_undo_keeps_stats_of_earlier_purchases(client, anna):
    (first,) = add(client, anna, "молоко")
    check(client, anna, first["id"])
    buy(client, anna)
    earlier = products(client, anna)["молоко"]["last_purchased_at"]
    (second,) = add(client, anna, "молоко")
    check(client, anna, second["id"])
    purchase = buy(client, anna).json()
    assert products(client, anna)["молоко"]["purchase_count"] == 2
    undo(client, anna, purchase["id"])
    stats = products(client, anna)["молоко"]
    assert stats["purchase_count"] == 1
    assert stats["last_purchased_at"] == earlier


def test_undo_twice_is_not_found_and_does_not_duplicate(client, anna):
    (milk,) = add(client, anna, "молоко")
    check(client, anna, milk["id"])
    purchase = buy(client, anna).json()
    assert undo(client, anna, purchase["id"]).status_code == 200
    assert undo(client, anna, purchase["id"]).status_code == 404
    assert len(entries(client, anna)) == 1


def test_buy_again_after_undo(client, anna):
    (milk,) = add(client, anna, "молоко")
    check(client, anna, milk["id"])
    undo(client, anna, buy(client, anna).json()["id"])
    assert buy(client, anna).json()["count"] == 1
    assert entries(client, anna) == []
    assert products(client, anna)["молоко"]["purchase_count"] == 1


def test_another_member_can_undo_but_a_stranger_cannot(client, sign_in, anna):
    share = client.get(f"/api/lists/{anna['list_id']}", headers=anna["headers"]).json()[
        "share_code"
    ]
    carlos = sign_in(CARLOS)
    client.post("/api/lists/join", json={"code": share}, headers=carlos["headers"])
    carlos_who = {"headers": carlos["headers"], "list_id": anna["list_id"]}
    (milk,) = add(client, anna, "молоко")
    check(client, anna, milk["id"])
    purchase = buy(client, carlos_who).json()
    eve = {"headers": sign_in(EVE)["headers"], "list_id": anna["list_id"]}
    assert buy(client, eve).status_code == 404
    assert undo(client, eve, purchase["id"]).status_code == 404
    assert undo(client, carlos_who, purchase["id"]).status_code == 200


def test_purchase_of_another_list_cannot_be_undone_through_this_one(client, anna):
    (milk,) = add(client, anna, "молоко")
    check(client, anna, milk["id"])
    purchase = buy(client, anna).json()
    other = client.post("/api/lists", json={"name": "Дача"}, headers=anna["headers"]).json()
    r = client.delete(
        f"/api/lists/{other['id']}/purchases/{purchase['id']}", headers=anna["headers"]
    )
    assert r.status_code == 404
    assert entries(client, anna) == []


def test_purchase_record_has_time_buyer_and_snapshots(client, sign_in, anna):
    share = client.get(f"/api/lists/{anna['list_id']}", headers=anna["headers"]).json()[
        "share_code"
    ]
    carlos = sign_in(CARLOS)
    client.post("/api/lists/join", json={"code": share}, headers=carlos["headers"])
    carlos_who = {"headers": carlos["headers"], "list_id": anna["list_id"]}
    milk, _bread = add(client, anna, "молоко, 2 л; хлеб")
    check(client, anna, milk["id"])  # Anna checks, Carlos presses «Куплено»
    purchase = buy(client, carlos_who).json()
    carlos_id = client.get("/api/me", headers=carlos["headers"]).json()["id"]
    assert purchase["purchased_by"] == carlos_id
    assert purchase["purchased_at"]
    assert purchase["entries"] == [{"name": "молоко", "note": "2 л"}]  # Unchecked хлеб is out


def test_undo_bumps_version_and_keeps_who_checked_and_added(client, sign_in, anna):
    share = client.get(f"/api/lists/{anna['list_id']}", headers=anna["headers"]).json()[
        "share_code"
    ]
    carlos = sign_in(CARLOS)
    client.post("/api/lists/join", json={"code": share}, headers=carlos["headers"])
    carlos_who = {"headers": carlos["headers"], "list_id": anna["list_id"]}
    (milk,) = add(client, anna, "молоко")
    check(client, carlos_who, milk["id"])
    before = entries(client, anna)[0]
    purchase = buy(client, anna).json()
    r = undo(client, anna, purchase["id"])
    assert r.json()["version"] > purchase["version"]
    (after,) = entries(client, anna)
    for field in ("added_by", "checked_by"):
        if field in before:
            assert after[field] == before[field]


@pytest.mark.parametrize("settings_overrides", [{"purchase_undo_grace_seconds": 0}])
def test_undo_after_the_grace_window_is_refused_and_changes_nothing(client, anna):
    (milk,) = add(client, anna, "молоко")
    check(client, anna, milk["id"])
    purchase = buy(client, anna).json()
    assert undo(client, anna, purchase["id"]).status_code == 409
    assert entries(client, anna) == []
    assert products(client, anna)["молоко"]["purchase_count"] == 1


def test_hidden_products_are_not_listed(client, anna):
    add(client, anna, "молоко")
    product_id = products(client, anna)["молоко"]["id"]
    r = client.delete(
        f"/api/lists/{anna['list_id']}/products/{product_id}", headers=anna["headers"]
    )
    assert r.status_code in (200, 204), r.text
    assert "молоко" not in products(client, anna)
