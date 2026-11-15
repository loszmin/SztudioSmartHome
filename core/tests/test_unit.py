"""Testy jednostkowe – bez bazy danych."""

import logging
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app import schemas
from app.auth import LoginThrottle
from app.config import Settings
from app.logging_filters import TokenRedactingFilter, install_token_redaction
from app.security import (
    SecretBox,
    TokenSigner,
    generate_api_token,
    hash_api_token,
    hash_password,
    verify_password,
)
from app.services.sensors import alarm_severity_for

SECRET = "unit-test-secret-key-unit-test-secret-key"


def test_password_hash_is_salted_and_verifiable():
    first, second = hash_password("haslo-123456"), hash_password("haslo-123456")
    assert first != second and "haslo" not in first
    assert verify_password("haslo-123456", first)
    assert not verify_password("inne-haslo", first)
    assert not verify_password("haslo-123456", None)  # nieistniejący użytkownik
    assert not verify_password("haslo-123456", "to-nie-jest-skrot")


def test_access_token_roundtrip_expiry_and_tampering():
    signer = TokenSigner(SECRET, ttl_minutes=10)
    token, expires = signer.issue("user-1", 3)
    assert signer.verify(token) == ("user-1", 3)
    assert expires > datetime.now(UTC)

    expired, _ = signer.issue("user-1", 3, now=datetime.now(UTC) - timedelta(hours=1))
    assert signer.verify(expired) is None
    assert signer.verify(token[:-2] + "xx") is None
    assert signer.verify("nie-token") is None
    assert TokenSigner("inny-sekret-inny-sekret-inny-sekret-00", 10).verify(token) is None


def test_secret_box_encrypts_device_credentials():
    box = SecretBox(SECRET)
    encrypted = box.encrypt("haslo-rejestratora")
    assert "haslo-rejestratora" not in encrypted
    assert box.encrypt("haslo-rejestratora") != encrypted  # losowy wektor inicjujący
    assert box.decrypt(encrypted) == "haslo-rejestratora"
    with pytest.raises(ValueError):
        SecretBox("inny-sekret-inny-sekret-inny-sekret-00").decrypt(encrypted)


def test_api_token_is_stored_only_as_hash():
    token = generate_api_token()
    assert token.startswith("szt_") and len(token) > 40
    assert token not in hash_api_token(token) and len(hash_api_token(token)) == 64


@pytest.mark.parametrize(
    ("sensor_type", "mode", "expected"),
    [
        ("smoke", "disarmed", "critical"),
        ("flood", "disarmed", "critical"),
        ("temperature", "disarmed", "warning"),
        ("contact", "disarmed", None),
        ("contact", "armed_home", "critical"),
        ("vibration", "armed_away", "critical"),
        ("motion", "disarmed", None),
        ("motion", "armed_home", None),
        ("motion", "armed_away", "critical"),
    ],
)
def test_alarm_rules(sensor_type, mode, expected):
    assert alarm_severity_for(sensor_type, mode) == expected


def test_login_throttle_blocks_after_limit_and_resets():
    throttle = LoginThrottle(max_attempts=2, lockout_seconds=60)
    assert throttle.retry_after("Admin", "1.1.1.1") == 0
    throttle.record_failure("admin", "1.1.1.1")
    throttle.record_failure("ADMIN", "1.1.1.1")
    assert throttle.retry_after("admin", "1.1.1.1") > 0
    assert throttle.retry_after("admin", "2.2.2.2") == 0  # inny adres nie jest blokowany
    throttle.reset("admin", "1.1.1.1")
    assert throttle.retry_after("admin", "1.1.1.1") == 0


def test_serialization_uses_camel_case_and_drops_only_optional_nulls():
    camera = schemas.CameraOut(
        id="c1", name="Kamera", location="", status="offline", signal_quality=None, source="rtsp",
        stream_name="cam1", recording=False, last_seen_at=None,
    )  # fmt: skip
    data = schemas.dump(camera)
    # Pola opcjonalne we frontendzie (`channel?`) są pomijane, pola `| null` zostają.
    assert data == {
        "id": "c1", "name": "Kamera", "location": "", "status": "offline", "signalQuality": None,
        "source": "rtsp", "streamName": "cam1", "recording": False, "lastSeenAt": None,
    }  # fmt: skip


def test_datetimes_serialize_as_utc_iso():
    event = schemas.EventOut(
        id="e1", category="motion", severity="info", title="t", source="s",
        occurred_at=datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC),
    )  # fmt: skip
    assert schemas.dump(event)["occurredAt"] == "2026-01-02T03:04:05Z"


def test_stream_name_rejects_urls_and_paths():
    with pytest.raises(ValidationError):
        schemas.CameraCreate(name="x", stream_name="rtsp://admin:haslo@10.0.0.1/stream")


def test_settings_require_strong_secret_key():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url="postgresql+psycopg://x/y", secret_key="za-krotki")


def test_tokens_are_redacted_from_server_logs(caplog):
    install_token_redaction()
    install_token_redaction()  # ponowne wywołanie nie dubluje filtra
    logger = logging.getLogger("uvicorn.error")
    assert sum(isinstance(item, TokenRedactingFilter) for item in logger.filters) == 1

    with caplog.at_level(logging.INFO, logger="uvicorn.error"):
        logger.info(
            '%s - "WebSocket %s" [accepted]', "10.0.0.2:0", "/ws/v1/events?token=eyJhbGciOi.tajny&x=1"
        )
    assert "tajny" not in caplog.text
    assert "/ws/v1/events?token=***&x=1" in caplog.text
