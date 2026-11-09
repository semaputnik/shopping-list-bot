"""Start-up and delivery: what the first screen costs over the network."""

from pathlib import Path

from conftest import TEST_BOT_TOKEN, sign_init_data
from fastapi.testclient import TestClient

from shopping_list_bot.app import create_app
from shopping_list_bot.config import Settings

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}


def test_auth_returns_the_users_lists(client):
    """Sign-in hands back the Lists too, so start-up needs no separate GET /api/lists."""
    body = client.post("/api/auth", json={"init_data": sign_init_data(ANNA)}).json()
    headers = {"Authorization": f"Bearer {body['token']}"}
    assert body["lists"] == client.get("/api/lists", headers=headers).json()
    assert [lst["name"] for lst in body["lists"]] == ["Покупки"]


def built_frontend(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text('<script src="/assets/index-abc123.js"></script>')
    (dist / "assets" / "index-abc123.js").write_text("console.log('shared lists');" * 400)
    return dist


def test_frontend_is_compressed_and_cached_by_content_hash(tmp_path):
    settings = Settings(
        bot_token=TEST_BOT_TOKEN,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        frontend_dist=built_frontend(tmp_path),
        _env_file=None,
    )
    with TestClient(create_app(settings)) as client:
        asset = client.get("/assets/index-abc123.js", headers={"Accept-Encoding": "gzip"})
        assert asset.status_code == 200
        assert asset.headers["content-encoding"] == "gzip"
        assert "immutable" in asset.headers["cache-control"]

        page = client.get("/", headers={"Accept-Encoding": "gzip"})
        assert page.headers["cache-control"] == "no-cache"
