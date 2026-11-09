"""Versioning, `changes?since`, conflict rules and idempotent replays (HTTP API only)."""

import pytest

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
CARLOS = {"id": 2002, "first_name": "Carlos", "language_code": "es-MX"}
EVE = {"id": 3003, "first_name": "Eve", "language_code": "en"}


@pytest.fixture
def anna(sign_in, client):
    session = sign_in(ANNA)
    (lst,) = client.get("/api/lists", headers=session["headers"]).json()
    return {"headers": session["headers"], "list": lst, "id": lst["id"]}


@pytest.fixture
def carlos(sign_in, anna, add_member):
    session = sign_in(CARLOS)
    add_member(anna["list"], session)
    return {"headers": session["headers"], "id": anna["id"]}


def add(client, who, text, **kwargs):
    response = client.post(
        f"/api/lists/{who['id']}/entries", json={"text": text}, headers=who["headers"], **kwargs
    )
    assert response.status_code == 201, response.text
    return response.json()["entries"]


def patch(client, who, entry_id, body, **kwargs):
    headers = kwargs.pop("headers", who["headers"])
    return client.patch(
        f"/api/lists/{who['id']}/entries/{entry_id}", json=body, headers=headers, **kwargs
    )


def version(client, who):
    return client.get(f"/api/lists/{who['id']}", headers=who["headers"]).json()["version"]


def changes(client, who, since):
    return client.get(
        f"/api/lists/{who['id']}/changes", params={"since": since}, headers=who["headers"]
    )


def entries(client, who):
    body = client.get(f"/api/lists/{who['id']}/entries", headers=who["headers"]).json()
    return [e for g in body["categories"] for e in g["entries"]]


class TestVersioning:
    def test_every_mutation_bumps_the_version_by_one(self, client, anna):
        h, lid = anna["headers"], anna["id"]
        (entry,) = add(client, anna, "молоко")
        (other,) = add(client, anna, "хлеб")
        product_id = entry["product_id"]

        mutations = {
            "add": lambda: add(client, anna, "сыр"),
            "check": lambda: patch(client, anna, entry["id"], {"checked": True}),
            "note": lambda: patch(client, anna, entry["id"], {"note": "2 л"}),
            "category": lambda: patch(client, anna, entry["id"], {"category": "bread"}),
            "delete": lambda: client.delete(f"/api/lists/{lid}/entries/{other['id']}", headers=h),
            "restore": lambda: client.post(
                f"/api/lists/{lid}/entries/{other['id']}/restore", headers=h
            ),
            "uncheck-all": lambda: client.post(f"/api/lists/{lid}/entries/uncheck-all", headers=h),
            "hide-product": lambda: client.delete(
                f"/api/lists/{lid}/products/{product_id}", headers=h
            ),
            "rename": lambda: client.patch(f"/api/lists/{lid}", json={"name": "Дом"}, headers=h),
        }
        for name, run in mutations.items():
            if name == "uncheck-all":
                # Ours is the only check and it is ours to undo, so this one has work to do.
                patch(client, anna, entry["id"], {"checked": True})
            before = version(client, anna)
            response = run()
            assert isinstance(response, list) or response.status_code < 300, name
            assert version(client, anna) == before + 1, name

    def test_buy_undo_join_and_leave_bump_the_version(self, client, anna, sign_in, add_member):
        h, lid = anna["headers"], anna["id"]
        (entry,) = add(client, anna, "молоко")
        patch(client, anna, entry["id"], {"checked": True})

        before = version(client, anna)
        purchase = client.post(f"/api/lists/{lid}/purchases", headers=h).json()
        assert purchase["version"] == before + 1

        undone = client.delete(f"/api/lists/{lid}/purchases/{purchase['id']}", headers=h).json()
        assert undone["version"] == before + 2

        carlos = sign_in(CARLOS)
        add_member(anna["list"], carlos)
        assert version(client, anna) == before + 3

        client.post(f"/api/lists/{lid}/leave", headers=carlos["headers"])
        assert version(client, anna) == before + 4

    def test_a_noop_does_not_bump_the_version(self, client, anna):
        (entry,) = add(client, anna, "молоко")
        patch(client, anna, entry["id"], {"checked": True})
        before = version(client, anna)
        patch(client, anna, entry["id"], {"checked": True})
        assert version(client, anna) == before


class TestChangesSince:
    def test_up_to_date_client_gets_nothing(self, client, anna):
        add(client, anna, "молоко")
        v = version(client, anna)
        assert changes(client, anna, v).json() == {"version": v, "changes": [], "snapshot": None}

    def test_missed_changes_come_in_order_with_their_kind_and_entry(self, client, anna, carlos):
        v0 = version(client, anna)
        (milk,) = add(client, carlos, "молоко")
        patch(client, carlos, milk["id"], {"checked": True})
        client.delete(f"/api/lists/{anna['id']}/entries/{milk['id']}", headers=anna["headers"])

        body = changes(client, anna, v0).json()
        assert body["snapshot"] is None
        assert body["version"] == v0 + 3
        assert [(c["version"], c["kind"], c["entry_id"]) for c in body["changes"]] == [
            (v0 + 1, "entries.added", None),
            (v0 + 2, "entry.updated", milk["id"]),
            (v0 + 3, "entry.deleted", milk["id"]),
        ]

    def test_membership_and_rename_are_changes_too(self, client, anna, sign_in, add_member):
        v0 = version(client, anna)
        add_member(anna["list"], sign_in(CARLOS))
        client.patch(f"/api/lists/{anna['id']}", json={"name": "Дом"}, headers=anna["headers"])
        kinds = [c["kind"] for c in changes(client, anna, v0).json()["changes"]]
        assert kinds == ["member.joined", "list.renamed"]

    @pytest.mark.parametrize("settings_overrides", [{"changes_max_gap": 3}])
    def test_a_big_gap_returns_a_snapshot(self, client, anna):
        v0 = version(client, anna)
        for name in ("a", "b", "c", "d"):
            add(client, anna, name)
        body = changes(client, anna, v0).json()
        assert body["changes"] == []
        assert body["version"] == v0 + 4
        names = [e["name"] for g in body["snapshot"]["categories"] for e in g["entries"]]
        assert sorted(names) == ["a", "b", "c", "d"]
        assert body["snapshot"]["list"]["version"] == v0 + 4

    @pytest.mark.parametrize("settings_overrides", [{"changes_retention": 2}])
    def test_a_pruned_log_returns_a_snapshot(self, client, anna):
        v0 = version(client, anna)
        for name in ("a", "b", "c"):
            add(client, anna, name)
        assert changes(client, anna, v0).json()["snapshot"] is not None
        # The newest versions are still covered.
        assert changes(client, anna, v0 + 2).json()["snapshot"] is None

    def test_a_client_ahead_of_the_list_gets_a_snapshot(self, client, anna):
        add(client, anna, "молоко")
        body = changes(client, anna, version(client, anna) + 50).json()
        assert body["snapshot"] is not None

    def test_a_non_member_cannot_ask(self, client, anna, sign_in):
        eve = sign_in(EVE)
        assert changes(client, {"id": anna["id"], "headers": eve["headers"]}, 0).status_code == 404

    def test_since_is_required_and_not_negative(self, client, anna):
        path = f"/api/lists/{anna['id']}/changes"
        assert client.get(path, headers=anna["headers"]).status_code == 422
        assert client.get(path, params={"since": -1}, headers=anna["headers"]).status_code == 422

    def test_a_deleted_list_cannot_be_caught_up(self, client, anna):
        client.delete(f"/api/lists/{anna['id']}", headers=anna["headers"])
        assert changes(client, anna, 0).status_code == 404


class TestConflicts:
    def test_a_check_beats_a_near_simultaneous_uncheck(self, client, anna, carlos):
        (milk,) = add(client, anna, "молоко")
        patch(client, anna, milk["id"], {"checked": True})
        before = version(client, anna)

        lost = patch(client, carlos, milk["id"], {"checked": False})
        assert lost.status_code == 200
        assert lost.json()["entry"]["checked"] is True
        assert version(client, anna) == before
        assert entries(client, anna)[0]["checked"] is True

    @pytest.mark.parametrize("settings_overrides", [{"check_wins_window_seconds": 0}])
    def test_an_uncheck_outside_the_window_applies(self, client, anna, carlos):
        (milk,) = add(client, anna, "молоко")
        patch(client, anna, milk["id"], {"checked": True})
        result = patch(client, carlos, milk["id"], {"checked": False})
        assert result.json()["entry"]["checked"] is False

    def test_the_checker_can_undo_their_own_check_at_once(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        patch(client, anna, milk["id"], {"checked": True})
        result = patch(client, anna, milk["id"], {"checked": False})
        assert result.json()["entry"]["checked"] is False

    def test_uncheck_all_spares_a_check_made_just_now_by_someone_else(self, client, anna, carlos):
        old, fresh = add(client, anna, "молоко; хлеб")
        patch(client, carlos, fresh["id"], {"checked": True})
        patch(client, anna, old["id"], {"checked": True})
        path = f"/api/lists/{anna['id']}/entries/uncheck-all"
        result = client.post(path, headers=anna["headers"]).json()
        # Anna's own check goes; Carlos's is too fresh to undo.
        assert result["unchecked"] == 1
        state = {e["id"]: e["checked"] for e in entries(client, anna)}
        assert state == {old["id"]: False, fresh["id"]: True}

    def test_a_delete_beats_an_edit(self, client, anna, carlos):
        (milk,) = add(client, anna, "молоко")
        client.delete(f"/api/lists/{anna['id']}/entries/{milk['id']}", headers=anna["headers"])

        for body in ({"note": "2 л"}, {"checked": True}, {"category": "bread"}):
            assert patch(client, carlos, milk["id"], body).status_code == 404
        assert entries(client, anna) == []

    def test_concurrent_adds_of_the_same_product_both_stand(self, client, anna, carlos):
        add(client, anna, "молоко")
        add(client, carlos, "молоко")
        assert [e["name"] for e in entries(client, anna)] == ["молоко", "молоко"]


class TestIdempotentReplays:
    def test_a_replayed_add_returns_the_original_answer_and_adds_nothing(self, client, anna):
        headers = {**anna["headers"], "Idempotency-Key": "add-1"}
        path = f"/api/lists/{anna['id']}/entries"
        first = client.post(path, json={"text": "молоко"}, headers=headers)
        add(client, anna, "хлеб")  # the List moves on
        replay = client.post(path, json={"text": "молоко"}, headers=headers)

        assert first.status_code == replay.status_code == 201
        assert replay.json() == first.json()  # including the original version
        assert replay.headers["Idempotent-Replayed"] == "true"
        assert sorted(e["name"] for e in entries(client, anna)) == ["молоко", "хлеб"]

    def test_a_replayed_buy_does_not_buy_again(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        patch(client, anna, milk["id"], {"checked": True})
        headers = {**anna["headers"], "Idempotency-Key": "buy-1"}
        path = f"/api/lists/{anna['id']}/purchases"
        first = client.post(path, headers=headers)
        (bread,) = add(client, anna, "хлеб")
        patch(client, anna, bread["id"], {"checked": True})

        replay = client.post(path, headers=headers)
        assert replay.status_code == 201
        assert replay.json() == first.json()
        assert [e["name"] for e in entries(client, anna)] == ["хлеб"]  # bread was not bought

    def test_a_replayed_edit_is_harmless(self, client, anna):
        (milk,) = add(client, anna, "молоко")
        headers = {**anna["headers"], "Idempotency-Key": "edit-1"}
        first = patch(client, anna, milk["id"], {"note": "2 л"}, headers=headers)
        v = version(client, anna)
        again = patch(client, anna, milk["id"], {"note": "2 л"}, headers=headers)
        assert again.json() == first.json()
        assert version(client, anna) == v

    def test_the_same_key_from_another_user_is_independent(self, client, anna, carlos):
        for who in (anna, carlos):
            response = client.post(
                f"/api/lists/{who['id']}/entries",
                json={"text": "молоко"},
                headers={**who["headers"], "Idempotency-Key": "same"},
            )
            assert response.status_code == 201
        assert len(entries(client, anna)) == 2

    def test_a_key_reused_for_another_request_is_refused(self, client, anna):
        headers = {**anna["headers"], "Idempotency-Key": "k"}
        path = f"/api/lists/{anna['id']}/entries"
        assert client.post(path, json={"text": "молоко"}, headers=headers).status_code == 201
        other = client.patch(f"/api/lists/{anna['id']}", json={"name": "Дом"}, headers=headers)
        assert other.status_code == 409

    def test_a_failed_command_is_not_remembered(self, client, anna):
        headers = {**anna["headers"], "Idempotency-Key": "retry"}
        path = f"/api/lists/{anna['id']}/entries"
        assert client.post(path, json={"text": "  "}, headers=headers).status_code == 422
        assert client.post(path, json={"text": "молоко"}, headers=headers).status_code == 201

    def test_a_replay_with_a_bad_session_is_not_served(self, client, anna):
        headers = {**anna["headers"], "Idempotency-Key": "k2"}
        path = f"/api/lists/{anna['id']}/entries"
        client.post(path, json={"text": "молоко"}, headers=headers)
        stolen = client.post(
            path,
            json={"text": "молоко"},
            headers={"Authorization": "Bearer nope", "Idempotency-Key": "k2"},
        )
        assert stolen.status_code == 401
