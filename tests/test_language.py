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
