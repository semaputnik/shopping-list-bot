import sqlite3

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
CARLOS = {"id": 2002, "first_name": "Carlos", "language_code": "es-MX"}
JOHN = {"id": 3003, "first_name": "John", "language_code": "en"}


def names(client, headers):
    return [c["name"] for c in client.get("/api/categories", headers=headers).json()]


def list_names(client, headers):
    return [lst["name"] for lst in client.get("/api/lists", headers=headers).json()]


def test_language_defaults_to_telegram_language_code(sign_in):
    assert sign_in(ANNA)["response"]["user"]["language"] == "ru"
    carlos = sign_in(CARLOS)["response"]["user"]
    assert carlos["language"] == "es"
    assert carlos["language_overridden"] is False
    assert sign_in(JOHN)["response"]["user"]["language"] == "ru"


def test_user_can_override_language(client, sign_in):
    session = sign_in(ANNA)
    response = client.patch("/api/me", json={"language": "es"}, headers=session["headers"])
    assert response.status_code == 200
    assert response.json()["language"] == "es"
    assert response.json()["language_overridden"] is True
    assert client.get("/api/me", headers=session["headers"]).json()["language"] == "es"


def test_choice_persists_across_sessions_and_devices(client, sign_in):
    first = sign_in(ANNA)
    client.patch("/api/me", json={"language": "es"}, headers=first["headers"])
    # A fresh sign-in (another device) still reports the choice, even though Telegram says ru.
    second = sign_in(ANNA)
    assert second["response"]["user"]["language"] == "es"
    assert client.get("/api/me", headers=second["headers"]).json()["language"] == "es"


def test_override_beats_changed_telegram_language(client, sign_in):
    session = sign_in(CARLOS)
    client.patch("/api/me", json={"language": "ru"}, headers=session["headers"])
    again = sign_in({**CARLOS, "language_code": "es"})
    assert again["response"]["user"]["language"] == "ru"


def test_null_goes_back_to_telegram_language(client, sign_in):
    session = sign_in(ANNA)
    client.patch("/api/me", json={"language": "es"}, headers=session["headers"])
    response = client.patch("/api/me", json={"language": None}, headers=session["headers"])
    assert response.json()["language"] == "ru"
    assert response.json()["language_overridden"] is False


def test_unsupported_language_is_rejected(client, sign_in):
    session = sign_in(ANNA)
    response = client.patch("/api/me", json={"language": "fr"}, headers=session["headers"])
    assert response.status_code == 422
    assert client.get("/api/me", headers=session["headers"]).json()["language"] == "ru"


def test_language_change_requires_authentication(client):
    assert client.patch("/api/me", json={"language": "es"}).status_code == 401


def test_language_is_per_user(client, sign_in):
    anna, carlos = sign_in(ANNA), sign_in(CARLOS)
    client.patch("/api/me", json={"language": "es"}, headers=anna["headers"])
    assert client.get("/api/me", headers=carlos["headers"]).json()["language"] == "es"
    client.patch("/api/me", json={"language": "ru"}, headers=carlos["headers"])
    assert client.get("/api/me", headers=anna["headers"]).json()["language"] == "es"


def test_system_category_names_follow_the_language(client, sign_in):
    session = sign_in(ANNA)
    assert "Молочное" in names(client, session["headers"])
    client.patch("/api/me", json={"language": "es"}, headers=session["headers"])
    es = names(client, session["headers"])
    assert "Lácteos" in es
    assert "Молочное" not in es
    client.patch("/api/me", json={"language": "ru"}, headers=session["headers"])
    assert "Молочное" in names(client, session["headers"])


def test_first_list_name_follows_the_language(client, sign_in):
    assert list_names(client, sign_in(CARLOS)["headers"]) == ["Compras"]
    assert list_names(client, sign_in(ANNA)["headers"]) == ["Покупки"]


def test_first_list_name_switches_with_the_language(client, sign_in):
    session = sign_in(ANNA)
    assert list_names(client, session["headers"]) == ["Покупки"]
    client.patch("/api/me", json={"language": "es"}, headers=session["headers"])
    assert list_names(client, session["headers"]) == ["Compras"]
    lst = client.get("/api/lists", headers=session["headers"]).json()[0]
    one = client.get(f"/api/lists/{lst['id']}", headers=session["headers"]).json()
    assert one["name"] == "Compras"
    client.patch("/api/me", json={"language": "ru"}, headers=session["headers"])
    assert list_names(client, session["headers"]) == ["Покупки"]


def test_each_member_sees_the_default_name_in_their_own_language(client, sign_in, tmp_path):
    anna, carlos = sign_in(ANNA), sign_in(CARLOS)
    anna_list = client.get("/api/lists", headers=anna["headers"]).json()[0]
    carlos_id = client.get("/api/me", headers=carlos["headers"]).json()["id"]
    # TODO: switch to the Share-link join flow once #5 (PR #15) lands. There is no join
    # endpoint yet, so the Member is added directly.
    with sqlite3.connect(tmp_path / "test.db") as db:
        db.execute(
            "INSERT INTO list_member (list_id, user_id, joined_at) VALUES (?, ?, datetime('now'))",
            (anna_list["id"], carlos_id),
        )
    url = f"/api/lists/{anna_list['id']}"
    assert client.get(url, headers=carlos["headers"]).json()["name"] == "Compras"
    assert client.get(url, headers=anna["headers"]).json()["name"] == "Покупки"


def test_system_categories_are_the_full_ordered_set_with_uncategorized_last(client, sign_in):
    ru = client.get("/api/categories", headers=sign_in(ANNA)["headers"]).json()
    es = client.get("/api/categories", headers=sign_in(CARLOS)["headers"]).json()
    assert [c["name"] for c in ru] == [
        "Фрукты и овощи",
        "Хлеб",
        "Молочное",
        "Мясо и рыба",
        "Заморозка",
        "Бакалея",
        "Напитки",
        "Бытовая химия",
        "Гигиена",
        "Прочее",
        "Без категории",
    ]
    assert [c["name"] for c in es] == [
        "Frutas y verduras",
        "Pan",
        "Lácteos",
        "Carne y pescado",
        "Congelados",
        "Despensa",
        "Bebidas",
        "Limpieza",
        "Higiene",
        "Otros",
        "Sin categoría",
    ]
    assert [c["key"] for c in ru] == [c["key"] for c in es]
    assert ru[-1]["key"] == "uncategorized"


def test_categories_require_authentication(client):
    assert client.get("/api/categories").status_code == 401


def test_empty_language_update_is_rejected(client, sign_in):
    session = sign_in(ANNA)
    assert client.patch("/api/me", json={}, headers=session["headers"]).status_code == 422
