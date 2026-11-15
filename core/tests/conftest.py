"""Wspólne przygotowanie testów. Testy integracyjne działają na prawdziwym PostgreSQL.

Adres bazy testowej: zmienna SZTUDIO_TEST_DATABASE_URL (baza jest czyszczona!).
"""

import os
from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import Settings
from app.db import Base, make_engine
from app.main import create_app
from tests.fakes import FakeGo2rtc, FakeOnvifDevice, FakeRtspServer, LoopThread

TEST_DATABASE_URL = os.environ.get(
    "SZTUDIO_TEST_DATABASE_URL", "postgresql+psycopg://sztudio:sztudio@127.0.0.1:5432/sztudio_test"
)
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "bardzo-tajne-haslo"
CORE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def alembic_config() -> Config:
    config = Config(os.path.join(CORE_DIR, "alembic.ini"))
    config.set_main_option("script_location", os.path.join(CORE_DIR, "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    config.attributes["configure_logging"] = False
    return config


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "test",
        "database_url": TEST_DATABASE_URL,
        "secret_key": "test-secret-key-test-secret-key-0123456789",
        "admin_username": ADMIN_USERNAME,
        "admin_password": ADMIN_PASSWORD,
        "login_max_attempts": 3,
        "login_lockout_seconds": 60,
        # Atrapy urządzeń działają na 127.0.0.1 – w produkcji pętla zwrotna nie jest dozwolona.
        "allowed_device_networks": "127.0.0.0/8",
        "denied_device_networks": "127.0.0.200/32",
        "monitor_interval_seconds": 0,  # cykle monitora wywołują testy
        "monitor_failure_threshold": 2,
        "device_timeout_seconds": 1.0,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


@pytest.fixture(scope="session")
def database() -> Iterator[None]:
    """Buduje schemat migracjami Alembic – te same, których używa produkcja."""
    engine = make_engine(TEST_DATABASE_URL)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    engine.dispose()
    command.upgrade(alembic_config(), "head")
    yield


@pytest.fixture
def clean_database(database: None) -> Iterator[None]:
    engine = make_engine(TEST_DATABASE_URL)
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    engine.dispose()
    yield


@pytest.fixture
def client(clean_database: None) -> Iterator[TestClient]:
    with TestClient(create_app(make_settings())) as test_client:
        yield test_client


def login(client: TestClient, username: str = ADMIN_USERNAME, password: str = ADMIN_PASSWORD) -> str:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["accessToken"]


@pytest.fixture
def admin(client: TestClient) -> dict[str, str]:
    """Nagłówki zalogowanego administratora."""
    return {"Authorization": f"Bearer {login(client)}"}


@pytest.fixture
def viewer(client: TestClient, admin: dict[str, str]) -> dict[str, str]:
    """Nagłówki tokenu API z uprawnieniami tylko do odczytu."""
    response = client.post("/api/v1/auth/tokens", json={"name": "panel", "role": "viewer"}, headers=admin)
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


# ---------- atrapy urządzeń ----------


@pytest.fixture(scope="session")
def fake_loop() -> Iterator[LoopThread]:
    loop = LoopThread()
    yield loop
    loop.stop()


@pytest.fixture
def rtsp_server(fake_loop: LoopThread) -> Iterator[FakeRtspServer]:
    server = FakeRtspServer(
        paths=("/stream1", "/cam/realmonitor?channel=1&subtype=0", "/onvif/main", "/onvif/sub")
    )
    server.loop = fake_loop  # type: ignore[attr-defined]
    fake_loop.run(server.start())
    yield server
    fake_loop.run(server.stop())


@pytest.fixture
def onvif_device(fake_loop: LoopThread, rtsp_server: FakeRtspServer) -> Iterator[FakeOnvifDevice]:
    device = FakeOnvifDevice(rtsp_port=rtsp_server.port)
    fake_loop.run(device.start())
    yield device
    fake_loop.run(device.stop())


@pytest.fixture
def go2rtc(client: TestClient) -> FakeGo2rtc:
    """Podłącza atrapę go2rtc do monitora uruchomionej aplikacji."""
    fake = FakeGo2rtc()
    client.app.state.monitor.go2rtc = fake
    return fake
