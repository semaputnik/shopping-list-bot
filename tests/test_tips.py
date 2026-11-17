"""One-time onboarding tips: a dismissal is stored per user and comes back on sign-in."""

ANNA = {"id": 1001, "first_name": "Анна", "language_code": "ru"}
CARLOS = {"id": 1003, "first_name": "Карлос", "language_code": "es"}


def test_new_user_has_no_dismissed_tips(sign_in):
    assert sign_in(ANNA)["response"]["user"]["dismissed_tips"] == []


def test_dismissing_a_tip_is_remembered_across_sign_ins(client, sign_in):
    session = sign_in(ANNA)
    response = client.post("/api/me/tips/multi_add/dismiss", headers=session["headers"])
    assert response.status_code == 200
    assert response.json()["dismissed_tips"] == ["multi_add"]
    # Another device signs in later and still sees the dismissal.
    assert sign_in(ANNA)["response"]["user"]["dismissed_tips"] == ["multi_add"]
    assert client.get("/api/me", headers=session["headers"]).json()["dismissed_tips"] == [
        "multi_add"
    ]


def test_dismissing_twice_records_it_once(client, sign_in):
    session = sign_in(ANNA)
    client.post("/api/me/tips/invite/dismiss", headers=session["headers"])
    response = client.post("/api/me/tips/invite/dismiss", headers=session["headers"])
    assert response.status_code == 200
    assert response.json()["dismissed_tips"] == ["invite"]


def test_each_tip_is_dismissed_on_its_own(client, sign_in):
    session = sign_in(ANNA)
    client.post("/api/me/tips/bought/dismiss", headers=session["headers"])
    response = client.post("/api/me/tips/multi_add/dismiss", headers=session["headers"])
    assert sorted(response.json()["dismissed_tips"]) == ["bought", "multi_add"]


def test_dismissals_belong_to_one_user(client, sign_in):
    anna = sign_in(ANNA)
    client.post("/api/me/tips/multi_add/dismiss", headers=anna["headers"])
    assert sign_in(CARLOS)["response"]["user"]["dismissed_tips"] == []


def test_unknown_tip_is_rejected(client, sign_in):
    session = sign_in(ANNA)
    response = client.post("/api/me/tips/nonsense/dismiss", headers=session["headers"])
    assert response.status_code == 404
    assert client.get("/api/me", headers=session["headers"]).json()["dismissed_tips"] == []


def test_dismissing_needs_a_session(client):
    assert client.post("/api/me/tips/multi_add/dismiss").status_code == 401
