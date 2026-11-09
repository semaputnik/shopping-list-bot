"""Checking and unchecking Entries, and unchecking everything (HTTP API only)."""

import pytest

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
CARLOS = {"id": 2002, "first_name": "Carlos", "language_code": "es-MX"}
STRANGER = {"id": 3003, "first_name": "Eve", "language_code": "en"}


def member(client, sign_in, user):
    session = sign_in(user)
    lists = client.get("/api/lists", headers=session["headers"]).json()
    return {
        "headers": session["headers"],
        "list_id": lists[0]["id"],
        "user": session["response"]["user"],
    }


@pytest.fixture
def anna(sign_in, client):
    return member(client, sign_in, ANNA)


def add(client, who, text):
    response = client.post(
        f"/api/lists/{who['list_id']}/entries", json={"text": text}, headers=who["headers"]
    )
    assert response.status_code == 201, response.text
    return response.json()["entries"]


def set_checked(client, who, entry_id, checked, list_id=None):
    return client.patch(
        f"/api/lists/{list_id or who['list_id']}/entries/{entry_id}",
        json={"checked": checked},
        headers=who["headers"],
    )


def uncheck_all(client, who):
    return client.post(f"/api/lists/{who['list_id']}/entries/uncheck-all", headers=who["headers"])


def flat(client, who):
    response = client.get(f"/api/lists/{who['list_id']}/entries", headers=who["headers"])
    assert response.status_code == 200, response.text
    body = response.json()
    return [e for g in body["categories"] for e in g["entries"]], body


def test_new_entries_are_unchecked(client, anna):
    (entry,) = add(client, anna, "молоко")
    assert entry["checked"] is False
    assert entry["checked_by"] is None


def test_check_then_uncheck_toggles_state(client, anna):
    (entry,) = add(client, anna, "молоко")
    response = set_checked(client, anna, entry["id"], True)
    assert response.status_code == 200, response.text
    assert response.json()["entry"]["checked"] is True
    assert response.json()["entry"]["checked_by"] == anna["user"]["id"]

    (listed,) = flat(client, anna)[0]
    assert listed["checked"] is True

    response = set_checked(client, anna, entry["id"], False)
    assert response.json()["entry"]["checked"] is False
    assert response.json()["entry"]["checked_by"] is None
    assert flat(client, anna)[0][0]["checked"] is False


def test_checked_entry_stays_in_place(client, anna):
    first, second, third = add(client, anna, "молоко; кефир; сметана")
    set_checked(client, anna, second["id"], True)
    entries, body = flat(client, anna)
    assert [e["id"] for e in entries] == [first["id"], second["id"], third["id"]]
    assert [e["checked"] for e in entries] == [False, True, False]
    assert len(body["categories"]) == 1
    assert body["categories"][0]["count"] == 3  # the count includes Checked Entries


def test_checking_bumps_version_and_repeat_is_a_noop(client, anna):
    (entry,) = add(client, anna, "молоко")
    before = flat(client, anna)[1]["list"]["version"]

    first = set_checked(client, anna, entry["id"], True).json()
    assert first["version"] == before + 1
    again = set_checked(client, anna, entry["id"], True).json()
    assert again["version"] == first["version"]
    assert flat(client, anna)[1]["list"]["version"] == first["version"]

    unchecked = set_checked(client, anna, entry["id"], False).json()
    assert unchecked["version"] == first["version"] + 1


def test_duplicate_entries_check_independently(client, anna):
    one, two = add(client, anna, "молоко; молоко")
    set_checked(client, anna, one["id"], True)
    entries, _ = flat(client, anna)
    assert {e["id"]: e["checked"] for e in entries} == {one["id"]: True, two["id"]: False}


# The "check beats a near-simultaneous uncheck" window is switched off here (see test_conflicts).
@pytest.mark.parametrize("settings_overrides", [{"check_wins_window_seconds": 0}])
def test_other_member_sees_and_changes_checked_state(client, sign_in, anna):
    (entry,) = add(client, anna, "молоко")
    code = client.get(f"/api/lists/{anna['list_id']}", headers=anna["headers"]).json()["share_code"]
    carlos = sign_in(CARLOS)
    joined = client.post("/api/lists/join", json={"code": code}, headers=carlos["headers"])
    assert joined.status_code == 200
    carlos = {"headers": carlos["headers"], "list_id": anna["list_id"]}

    set_checked(client, anna, entry["id"], True)
    (seen,) = flat(client, carlos)[0]
    assert seen["checked"] is True
    assert seen["checked_by"] == anna["user"]["id"]

    # Equal rights: any Member may uncheck.
    assert set_checked(client, carlos, entry["id"], False).json()["entry"]["checked"] is False


def test_non_member_cannot_check_or_uncheck_all(client, sign_in, anna):
    (entry,) = add(client, anna, "молоко")
    eve = sign_in(STRANGER)
    eve = {"headers": eve["headers"], "list_id": anna["list_id"]}
    assert set_checked(client, eve, entry["id"], True).status_code == 404
    assert uncheck_all(client, eve).status_code == 404
    assert flat(client, anna)[0][0]["checked"] is False


def test_unknown_entry_and_entry_of_another_list_are_404(client, sign_in, anna):
    assert set_checked(client, anna, 9999, True).status_code == 404
    carlos = member(client, sign_in, CARLOS)
    (foreign,) = add(client, carlos, "сыр")
    # A real Entry id, but of a List that is not the one in the path.
    assert set_checked(client, anna, foreign["id"], True).status_code == 404
    assert flat(client, carlos)[0][0]["checked"] is False


def test_check_requires_auth_and_a_boolean(client, anna):
    (entry,) = add(client, anna, "молоко")
    url = f"/api/lists/{anna['list_id']}/entries/{entry['id']}"
    assert client.patch(url, json={"checked": True}).status_code == 401
    for bad in ({"checked": None}, {"checked": "maybe"}):
        assert client.patch(url, json=bad, headers=anna["headers"]).status_code == 422
    assert client.post(f"{url[: url.rindex('/')]}/uncheck-all").status_code == 401


def test_uncheck_all_clears_every_entry(client, anna):
    a, _b, c = add(client, anna, "молоко; хлеб; яблоки")
    for entry in (a, c):
        set_checked(client, anna, entry["id"], True)
    version = flat(client, anna)[1]["list"]["version"]

    response = uncheck_all(client, anna)
    assert response.status_code == 200, response.text
    assert response.json() == {"version": version + 1, "unchecked": 2}
    entries, body = flat(client, anna)
    assert len(entries) == 3  # Entries are not removed
    assert all(not e["checked"] and e["checked_by"] is None for e in entries)
    assert body["list"]["version"] == version + 1


def test_uncheck_all_with_nothing_checked_does_not_bump_version(client, anna):
    add(client, anna, "молоко")
    version = flat(client, anna)[1]["list"]["version"]
    assert uncheck_all(client, anna).json() == {"version": version, "unchecked": 0}


def test_uncheck_all_touches_only_its_own_list(client, sign_in, anna):
    carlos = member(client, sign_in, CARLOS)
    (mine,) = add(client, anna, "молоко")
    (theirs,) = add(client, carlos, "leche")
    set_checked(client, anna, mine["id"], True)
    set_checked(client, carlos, theirs["id"], True)

    uncheck_all(client, anna)
    assert flat(client, anna)[0][0]["checked"] is False
    assert flat(client, carlos)[0][0]["checked"] is True


def test_empty_patch_is_a_no_op(client, anna):
    # One PATCH serves checking, the Note and the Category; sending nothing changes nothing.
    (entry,) = add(client, anna, "молоко")
    version = flat(client, anna)[1]["list"]["version"]
    url = f"/api/lists/{anna['list_id']}/entries/{entry['id']}"
    response = client.patch(url, json={}, headers=anna["headers"])
    assert response.status_code == 200
    assert response.json()["version"] == version
    assert response.json()["entry"]["checked"] is False


def test_check_and_note_in_one_request_bump_the_version_once(client, anna):
    (entry,) = add(client, anna, "молоко")
    version = flat(client, anna)[1]["list"]["version"]
    url = f"/api/lists/{anna['list_id']}/entries/{entry['id']}"
    response = client.patch(url, json={"checked": True, "note": "2 л"}, headers=anna["headers"])
    assert response.status_code == 200, response.text
    assert response.json()["version"] == version + 1
    assert response.json()["entry"]["checked"] is True
    assert response.json()["entry"]["note"] == "2 л"


def delete(client, who, entry_id):
    url = f"/api/lists/{who['list_id']}/entries/{entry_id}"
    response = client.delete(url, headers=who["headers"])
    assert response.status_code == 200, response.text
    return response


@pytest.mark.parametrize("checked", [True, False])
def test_a_deleted_entry_cannot_be_checked_or_unchecked(client, anna, checked):
    # A delete beats an edit: the Entry is gone for everyone.
    (entry,) = add(client, anna, "молоко")
    delete(client, anna, entry["id"])
    version = flat(client, anna)[1]["list"]["version"]
    assert set_checked(client, anna, entry["id"], checked).status_code == 404
    assert flat(client, anna)[1]["list"]["version"] == version


def test_uncheck_all_ignores_deleted_entries(client, anna):
    visible, gone = add(client, anna, "молоко; хлеб")
    set_checked(client, anna, visible["id"], True)
    set_checked(client, anna, gone["id"], True)
    delete(client, anna, gone["id"])
    version = flat(client, anna)[1]["list"]["version"]

    assert uncheck_all(client, anna).json() == {"version": version + 1, "unchecked": 1}


def test_uncheck_all_with_only_deleted_checked_entries_is_a_no_op(client, anna):
    (entry,) = add(client, anna, "молоко")
    set_checked(client, anna, entry["id"], True)
    delete(client, anna, entry["id"])
    version = flat(client, anna)[1]["list"]["version"]
    assert uncheck_all(client, anna).json() == {"version": version, "unchecked": 0}
