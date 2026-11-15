from fastapi.testclient import TestClient
from sqlalchemy import select

from app import models
from app.main import create_app
from tests.conftest import ADMIN_PASSWORD, ADMIN_USERNAME, login, make_settings

PROTECTED_GET = [
    "/api/v1/system/status", "/api/v1/devices", "/api/v1/cameras", "/api/v1/recorders", "/api/v1/alarms",
    "/api/v1/alarms/arming", "/api/v1/sensors", "/api/v1/events", "/api/v1/network/devices",
    "/api/v1/auth/me", "/api/v1/auth/tokens",
]  # fmt: skip


def test_health_is_public_and_reveals_nothing(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200 and response.json() == {"status": "ok"}


def test_every_resource_requires_authentication(client):
    for path in PROTECTED_GET:
        assert client.get(path).status_code == 401, path
        assert client.get(path, headers={"Authorization": "Bearer nieprawidlowy"}).status_code == 401, path
    assert client.put("/api/v1/alarms/arming", json={"mode": "disarmed"}).status_code == 401
    assert client.post("/api/v1/alarms/x/acknowledge").status_code == 401


def test_login_returns_token_and_user(client):
    response = client.post(
        "/api/v1/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    )
    body = response.json()
    assert response.status_code == 200
    assert set(body) == {"accessToken", "tokenType", "expiresAt", "user"}
    assert body["user"]["username"] == ADMIN_USERNAME and body["user"]["role"] == "admin"

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['accessToken']}"})
    assert me.status_code == 200 and me.json()["username"] == ADMIN_USERNAME


def test_login_rejects_bad_credentials_and_locks_out(client):
    for _ in range(3):
        response = client.post(
            "/api/v1/auth/login", json={"username": ADMIN_USERNAME, "password": "zle-haslo"}
        )
        assert response.status_code == 401
    assert client.post("/api/v1/auth/login", json={"username": "nikt", "password": "x"}).status_code == 401

    # Po trzech błędach nawet poprawne hasło jest chwilowo odrzucane.
    locked = client.post("/api/v1/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert locked.status_code == 429 and int(locked.headers["Retry-After"]) > 0


def test_admin_password_is_hashed_in_database(client):
    with client.app.state.session_factory() as session:
        user = session.scalars(select(models.User)).one()
    assert user.password_hash.startswith("$argon2") and ADMIN_PASSWORD not in user.password_hash


def test_no_default_admin_without_configuration(clean_database):
    settings = make_settings(admin_username=None, admin_password=None)
    with TestClient(create_app(settings)) as client:
        assert (
            client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin"}).status_code
            == 401
        )
        with client.app.state.session_factory() as session:
            assert session.scalars(select(models.User)).all() == []


def test_change_password_invalidates_old_tokens(client, admin):
    payload = {"currentPassword": ADMIN_PASSWORD, "newPassword": "nowe-dlugie-haslo-1"}
    assert (
        client.post(
            "/api/v1/auth/change-password", json={**payload, "currentPassword": "zle"}, headers=admin
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/auth/change-password", json={**payload, "newPassword": "krotkie"}, headers=admin
        ).status_code
        == 422
    )
    assert client.post("/api/v1/auth/change-password", json=payload, headers=admin).status_code == 204

    assert client.get("/api/v1/auth/me", headers=admin).status_code == 401  # stary token
    assert (
        client.post(
            "/api/v1/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        ).status_code
        == 401
    )
    assert login(client, password="nowe-dlugie-haslo-1")


def test_api_token_lifecycle(client, admin):
    created = client.post(
        "/api/v1/auth/tokens", json={"name": "panel ścienny", "role": "viewer"}, headers=admin
    ).json()
    token = created["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/cameras", headers=headers).status_code == 200

    listed = client.get("/api/v1/auth/tokens", headers=admin).json()
    assert [item["name"] for item in listed] == ["panel ścienny"]
    assert "token" not in listed[0]  # wartość widoczna tylko przy utworzeniu
    with client.app.state.session_factory() as session:
        assert session.scalars(select(models.ApiToken)).one().token_hash != token

    assert client.delete(f"/api/v1/auth/tokens/{created['id']}", headers=admin).status_code == 204
    assert client.get("/api/v1/cameras", headers=headers).status_code == 401


def test_viewer_can_read_but_not_modify(client, viewer):
    assert client.get("/api/v1/alarms", headers=viewer).status_code == 200
    assert client.get("/api/v1/system/status", headers=viewer).status_code == 200

    forbidden = [
        ("put", "/api/v1/alarms/arming", {"mode": "disarmed"}),
        ("post", "/api/v1/alarms/x/acknowledge", None),
        ("post", "/api/v1/cameras", {"name": "k", "streamName": "k"}),
        ("post", "/api/v1/recorders", {"name": "r"}),
        ("post", "/api/v1/sensors", {"name": "s", "type": "motion"}),
        ("post", "/api/v1/events", {"category": "motion", "title": "t", "source": "s"}),
        ("post", "/api/v1/network/devices", {"name": "n", "ipAddress": "10.0.0.1"}),
        ("post", "/api/v1/auth/tokens", {"name": "t"}),
        ("get", "/api/v1/auth/tokens", None),
    ]
    for method, path, body in forbidden:
        response = client.request(method, path, json=body, headers=viewer)
        assert response.status_code == 403, (method, path, response.text)


def test_docs_are_disabled_in_production(clean_database):
    with TestClient(create_app(make_settings(environment="production"))) as client:
        assert client.get("/api/docs").status_code == 404
        assert client.get("/api/openapi.json").status_code == 404
