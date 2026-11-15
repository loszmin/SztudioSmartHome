"""Modele bazy danych Sztudio Core."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def new_id() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


Timestamp = DateTime(timezone=True)


class DiagnosticsMixin:
    """Wynik ostatnich prób połączenia z urządzeniem (wypełniany przez monitor i testy połączenia)."""

    last_attempt_at: Mapped[datetime | None] = mapped_column(Timestamp)
    last_success_at: Mapped[datetime | None] = mapped_column(Timestamp)
    last_error_code: Mapped[str | None] = mapped_column(String(32))
    last_error_message: Mapped[str | None] = mapped_column(Text)
    response_time_ms: Mapped[int | None] = mapped_column(Integer)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    #: `admin` – pełny dostęp; `viewer` – tylko odczyt.
    role: Mapped[str] = mapped_column(String(16), default="admin")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    #: Zwiększany przy zmianie hasła – unieważnia wcześniej wydane tokeny dostępu.
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(Timestamp)


class ApiToken(Base):
    """Długoterminowy token API (np. dla panelu ściennego). Przechowywany jest tylko skrót."""

    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(100))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    #: Początek tokenu – pozwala rozpoznać go na liście.
    prefix: Mapped[str] = mapped_column(String(16))
    #: Uprawnienia tokenu: `admin` lub `viewer`.
    role: Mapped[str] = mapped_column(String(16), default="viewer")
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(Timestamp)
    revoked_at: Mapped[datetime | None] = mapped_column(Timestamp)

    user: Mapped[User] = relationship()


class Recorder(DiagnosticsMixin, Base):
    __tablename__ = "recorders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(100))
    vendor: Mapped[str] = mapped_column(String(64), default="BCS")
    #: `bcs_point`, `bcs_line` lub `other` – wybór przyszłego sterownika integracji.
    series: Mapped[str] = mapped_column(String(16), default="other")
    model: Mapped[str] = mapped_column(String(100), default="")
    firmware: Mapped[str | None] = mapped_column(String(64))
    ip_address: Mapped[str | None] = mapped_column(String(255))
    #: Port HTTP interfejsu urządzenia.
    port: Mapped[int | None] = mapped_column(Integer)
    rtsp_port: Mapped[int | None] = mapped_column(Integer)
    onvif_port: Mapped[int | None] = mapped_column(Integer)
    #: Szablon ścieżki RTSP z polami {channel} i {subtype} – podawany przez użytkownika wg dokumentacji modelu.
    rtsp_path_template: Mapped[str | None] = mapped_column(Text)
    #: Wynik ostatniej weryfikacji protokołów (HTTP / RTSP / ONVIF).
    protocols: Mapped[list | None] = mapped_column(JSON)
    channels: Mapped[int | None] = mapped_column(Integer)
    username: Mapped[str | None] = mapped_column(String(100))
    #: Hasło urządzenia zaszyfrowane kluczem wyprowadzonym z SZTUDIO_SECRET_KEY.
    password_encrypted: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="offline")
    last_seen_at: Mapped[datetime | None] = mapped_column(Timestamp)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)


class Camera(DiagnosticsMixin, Base):
    __tablename__ = "cameras"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(100))
    location: Mapped[str] = mapped_column(String(100), default="")
    status: Mapped[str] = mapped_column(String(16), default="offline")
    signal_quality: Mapped[int | None] = mapped_column(Integer)
    #: `bcs`, `onvif` lub `rtsp`.
    source: Mapped[str] = mapped_column(String(16), default="rtsp")
    recorder_id: Mapped[str | None] = mapped_column(ForeignKey("recorders.id", ondelete="SET NULL"))
    channel: Mapped[int | None] = mapped_column(Integer)
    #: Nazwa strumienia w go2rtc – jedyny identyfikator wideo udostępniany klientom.
    stream_name: Mapped[str] = mapped_column(String(64), unique=True)
    #: Adres IP lub nazwa hosta kamery; puste = adres rejestratora (kamera podłączona przez rejestrator).
    ip_address: Mapped[str | None] = mapped_column(String(255))
    rtsp_port: Mapped[int | None] = mapped_column(Integer)
    #: Ścieżka RTSP wraz z parametrami (np. /stream1). Widoczna tylko dla administratora.
    rtsp_path: Mapped[str | None] = mapped_column(Text)
    onvif_port: Mapped[int | None] = mapped_column(Integer)
    #: Nazwa wybranego profilu strumienia (np. „main”, „sub” albo nazwa profilu ONVIF).
    stream_profile: Mapped[str | None] = mapped_column(String(64))
    #: Dane logowania kamery; puste = dane rejestratora. Hasło zaszyfrowane, nigdy nie zwracane przez API.
    username: Mapped[str | None] = mapped_column(String(100))
    password_encrypted: Mapped[str | None] = mapped_column(Text)
    #: Wyłączona kamera nie jest monitorowana ani udostępniana w go2rtc.
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    #: Stan strumienia w go2rtc: not_configured / registered / error.
    stream_state: Mapped[str] = mapped_column(
        String(16), default="not_configured", server_default="not_configured"
    )
    vendor: Mapped[str] = mapped_column(String(64), default="")
    model: Mapped[str] = mapped_column(String(100), default="")
    resolution: Mapped[str | None] = mapped_column(String(32))
    fps: Mapped[int | None] = mapped_column(Integer)
    recording: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    last_seen_at: Mapped[datetime | None] = mapped_column(Timestamp)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)


class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(100))
    location: Mapped[str] = mapped_column(String(100), default="")
    #: `motion`, `contact`, `flood`, `smoke`, `temperature`, `vibration`.
    type: Mapped[str] = mapped_column(String(16))
    state: Mapped[str] = mapped_column(String(16), default="idle")
    value: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(16))
    connection: Mapped[str] = mapped_column(String(16), default="offline")
    battery_percent: Mapped[int | None] = mapped_column(Integer)
    last_updated_at: Mapped[datetime | None] = mapped_column(Timestamp)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)


class Alarm(Base):
    __tablename__ = "alarms"
    __table_args__ = (Index("ix_alarms_status_triggered", "status", "triggered_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="active")
    source_type: Mapped[str] = mapped_column(String(16))
    source_name: Mapped[str] = mapped_column(String(100))
    source_id: Mapped[str | None] = mapped_column(String(36))
    location: Mapped[str | None] = mapped_column(String(100))
    triggered_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)
    acknowledged_at: Mapped[datetime | None] = mapped_column(Timestamp)
    acknowledged_by: Mapped[str | None] = mapped_column(String(64))
    resolved_at: Mapped[datetime | None] = mapped_column(Timestamp)


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_events_occurred_at", "occurred_at"), Index("ix_events_category", "category"))

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    category: Mapped[str] = mapped_column(String(32))
    severity: Mapped[str] = mapped_column(String(16), default="info")
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(100))
    occurred_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)


class NetworkDevice(Base):
    __tablename__ = "network_devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(100))
    #: `core`, `recorder`, `camera`, `router`, `switch`, `other`.
    type: Mapped[str] = mapped_column(String(16), default="other")
    ip_address: Mapped[str] = mapped_column(String(45))
    mac_address: Mapped[str | None] = mapped_column(String(17))
    vendor: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(16), default="offline")
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    last_seen_at: Mapped[datetime | None] = mapped_column(Timestamp)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)


class AlarmSystem(Base):
    """Stan uzbrojenia systemu – pojedynczy wiersz (id = 1)."""

    __tablename__ = "alarm_system"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    mode: Mapped[str] = mapped_column(String(16), default="disarmed")
    changed_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)
    changed_by: Mapped[str | None] = mapped_column(String(64))
