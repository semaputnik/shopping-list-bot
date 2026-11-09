"""The SSE stream `GET /api/events`, against a real server on a local port.

Starlette's TestClient buffers a response until it ends, so a never-ending stream cannot be read
through it; these tests run uvicorn in a thread and talk to it over HTTP like the Mini App does.
"""

import json
import queue
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
import uvicorn
from conftest import TEST_BOT_TOKEN, sign_init_data

from shopping_list_bot.app import create_app
from shopping_list_bot.config import Settings

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
CARLOS = {"id": 2002, "first_name": "Carlos", "language_code": "es-MX"}
EVE = {"id": 3003, "first_name": "Eve", "language_code": "en"}


@pytest.fixture
def server(tmp_path: Path) -> Iterator[str]:
    settings = Settings(
        bot_token=TEST_BOT_TOKEN,
        bot_username="shared_lists_test_bot",
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        frontend_dist=tmp_path / "no-frontend",
        _env_file=None,
    )
    config = uvicorn.Config(
        create_app(settings),
        host="127.0.0.1",
        port=0,
        log_level="warning",
        timeout_graceful_shutdown=1,
    )
    srv = uvicorn.Server(config)
    thread = threading.Thread(target=srv.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not srv.started:
        assert time.monotonic() < deadline, "server did not start"
        time.sleep(0.02)
    port = srv.servers[0].sockets[0].getsockname()[1]
    yield f"http://127.0.0.1:{port}"
    srv.should_exit = True
    thread.join(timeout=10)


class Stream:
    """An open `/api/events` connection collecting parsed events in a queue."""

    def __init__(self, base: str, headers: dict):
        self.events: queue.Queue[tuple[str, dict]] = queue.Queue()
        self._client = httpx.Client(base_url=base, timeout=None)
        self._thread = threading.Thread(target=self._read, args=(headers,), daemon=True)
        self._thread.start()
        assert self.next()[0] == "ready"

    def _read(self, headers: dict) -> None:
        name = "message"
        try:
            with self._client.stream("GET", "/api/events", headers=headers) as response:
                self.status = response.status_code
                self.content_type = response.headers.get("content-type")
                for line in response.iter_lines():
                    if line.startswith("event:"):
                        name = line.partition(":")[2].strip()
                    elif line.startswith("data:"):
                        self.events.put((name, json.loads(line.partition(":")[2])))
                        name = "message"
        except httpx.HTTPError:
            pass

    def next(self, timeout: float = 5.0) -> tuple[str, dict]:
        return self.events.get(timeout=timeout)

    def expect_silence(self, seconds: float = 0.6) -> None:
        with pytest.raises(queue.Empty):
            self.events.get(timeout=seconds)

    def close(self) -> None:
        self._client.close()


class Api:
    def __init__(self, base: str, user: dict):
        self.base = base
        self.http = httpx.Client(base_url=base, timeout=10)
        response = self.http.post("/api/auth", json={"init_data": sign_init_data(user)})
        assert response.status_code == 200, response.text
        self.headers = {"Authorization": f"Bearer {response.json()['token']}"}
        self.http.headers.update(self.headers)
        (self.list,) = self.http.get("/api/lists").json()

    def open_stream(self) -> Stream:
        stream = Stream(self.base, self.headers)
        self._streams.append(stream)
        return stream

    _streams: list


@pytest.fixture
def make_user(server):
    made: list[Api] = []

    def _make(user: dict) -> Api:
        api = Api(server, user)
        api._streams = []
        made.append(api)
        return api

    yield _make
    for api in made:
        for stream in api._streams:
            stream.close()
        api.http.close()


def add(api: Api, list_id: int, text: str) -> dict:
    response = api.http.post(f"/api/lists/{list_id}/entries", json={"text": text})
    assert response.status_code == 201, response.text
    return response.json()


def test_the_stream_needs_a_session(server):
    assert httpx.get(f"{server}/api/events").status_code == 401


def test_the_stream_is_event_stream_and_says_ready(make_user):
    anna = make_user(ANNA)
    stream = anna.open_stream()
    assert stream.status == 200
    assert stream.content_type.startswith("text/event-stream")


def test_a_member_hears_the_other_members_change_with_its_version(make_user):
    anna, carlos = make_user(ANNA), make_user(CARLOS)
    lid = anna.list["id"]
    assert (
        carlos.http.post("/api/lists/join", json={"code": anna.list["share_code"]}).status_code
        == 200
    )
    anna_stream = anna.open_stream()
    carlos_stream = carlos.open_stream()

    result = add(carlos, lid, "молоко")

    for stream in (anna_stream, carlos_stream):  # the author hears it too (other devices)
        name, event = stream.next()
        assert name == "change"
        assert event == {
            "list_id": lid,
            "version": result["version"],
            "kind": "entries.added",
            "entry_id": None,
        }


def test_events_arrive_in_version_order(make_user):
    anna = make_user(ANNA)
    lid = anna.list["id"]
    stream = anna.open_stream()
    first = add(anna, lid, "молоко")
    entry = first["entries"][0]
    anna.http.patch(f"/api/lists/{lid}/entries/{entry['id']}", json={"checked": True})
    anna.http.delete(f"/api/lists/{lid}/entries/{entry['id']}")

    got = [stream.next()[1] for _ in range(3)]
    assert [e["kind"] for e in got] == ["entries.added", "entry.updated", "entry.deleted"]
    assert [e["version"] for e in got] == [first["version"] + i for i in range(3)]
    assert got[1]["entry_id"] == entry["id"]


def test_a_user_hears_nothing_about_lists_they_are_not_in(make_user):
    anna, eve = make_user(ANNA), make_user(EVE)
    eve_stream = eve.open_stream()
    anna_stream = anna.open_stream()

    add(anna, anna.list["id"], "молоко")
    anna_stream.next()
    eve_stream.expect_silence()

    # Eve still hears her own List, and only that one.
    add(eve, eve.list["id"], "хлеб")
    _, event = eve_stream.next()
    assert event["list_id"] == eve.list["id"]
    eve_stream.expect_silence(0.3)


def test_a_failed_request_emits_nothing(make_user):
    anna = make_user(ANNA)
    stream = anna.open_stream()
    lid = anna.list["id"]
    assert anna.http.post(f"/api/lists/{lid}/entries", json={"text": " "}).status_code == 422
    assert anna.http.post(f"/api/lists/{lid}/purchases").status_code == 409  # nothing checked
    stream.expect_silence()


def test_a_noop_emits_nothing(make_user):
    anna = make_user(ANNA)
    lid = anna.list["id"]
    entry = add(anna, lid, "молоко")["entries"][0]
    anna.http.patch(f"/api/lists/{lid}/entries/{entry['id']}", json={"checked": True})
    stream = anna.open_stream()
    anna.http.patch(f"/api/lists/{lid}/entries/{entry['id']}", json={"checked": True})
    stream.expect_silence()


def test_joining_leaving_and_renaming_reach_the_members(make_user):
    anna, carlos = make_user(ANNA), make_user(CARLOS)
    lid = anna.list["id"]
    anna_stream = anna.open_stream()
    carlos_stream = carlos.open_stream()

    carlos.http.post("/api/lists/join", json={"code": anna.list["share_code"]})
    assert anna_stream.next()[1]["kind"] == "member.joined"
    assert carlos_stream.next()[1]["kind"] == "member.joined"  # the new Member's own devices

    anna.http.patch(f"/api/lists/{lid}", json={"name": "Дом"})
    assert anna_stream.next()[1]["kind"] == "list.renamed"
    assert carlos_stream.next()[1]["kind"] == "list.renamed"

    carlos.http.post(f"/api/lists/{lid}/leave")
    assert anna_stream.next()[1]["kind"] == "member.left"
    assert carlos_stream.next()[1]["kind"] == "member.left"  # the leaver's devices drop the List

    add(anna, lid, "молоко")
    anna_stream.next()
    carlos_stream.expect_silence()  # and hear nothing more about it


def test_deleting_a_list_tells_every_member_and_nobody_else(make_user):
    anna, carlos, eve = make_user(ANNA), make_user(CARLOS), make_user(EVE)
    lid = anna.list["id"]
    carlos.http.post("/api/lists/join", json={"code": anna.list["share_code"]})
    streams = [anna.open_stream(), carlos.open_stream(), eve.open_stream()]

    assert carlos.http.delete(f"/api/lists/{lid}").status_code == 204

    for stream in streams[:2]:
        name, event = stream.next()
        assert (name, event["kind"], event["list_id"]) == ("change", "list.deleted", lid)
    streams[2].expect_silence()


def test_the_last_member_leaving_announces_the_deletion(make_user):
    anna = make_user(ANNA)
    stream = anna.open_stream()
    lid = anna.list["id"]
    anna.http.post(f"/api/lists/{lid}/leave")
    assert stream.next()[1]["kind"] == "list.deleted"


def test_a_new_list_is_announced_to_its_creator(make_user):
    anna = make_user(ANNA)
    stream = anna.open_stream()
    created = anna.http.post("/api/lists", json={"name": "Дача"}).json()
    _, event = stream.next()
    assert event["kind"] == "list.created"
    assert event["list_id"] == created["id"]


def test_purchases_are_announced(make_user):
    anna = make_user(ANNA)
    lid = anna.list["id"]
    entry = add(anna, lid, "молоко")["entries"][0]
    anna.http.patch(f"/api/lists/{lid}/entries/{entry['id']}", json={"checked": True})
    stream = anna.open_stream()
    purchase = anna.http.post(f"/api/lists/{lid}/purchases").json()
    assert stream.next()[1]["kind"] == "purchase.created"
    anna.http.delete(f"/api/lists/{lid}/purchases/{purchase['id']}")
    assert stream.next()[1]["kind"] == "purchase.undone"


def test_after_a_reconnect_changes_since_covers_what_was_missed(make_user):
    anna, carlos = make_user(ANNA), make_user(CARLOS)
    lid = anna.list["id"]
    carlos.http.post("/api/lists/join", json={"code": anna.list["share_code"]})
    stream = anna.open_stream()
    seen = add(carlos, lid, "молоко")
    assert stream.next()[1]["version"] == seen["version"]
    stream.close()  # the connection drops

    add(carlos, lid, "хлеб")
    add(carlos, lid, "сыр")

    again = anna.open_stream()  # reconnect, then catch up from the last version seen
    again.expect_silence(0.3)
    body = anna.http.get(f"/api/lists/{lid}/changes", params={"since": seen["version"]}).json()
    assert [c["kind"] for c in body["changes"]] == ["entries.added", "entries.added"]
    assert body["version"] == seen["version"] + 2
