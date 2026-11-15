"""Schematy API – kontrakt zgodny z typami frontendu (`src/types/api.ts`): JSON w camelCase, daty ISO 8601 UTC."""

from datetime import datetime
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, SerializerFunctionWrapHandler, model_serializer
from pydantic.alias_generators import to_camel

from app import models

ConnectionStatus = Literal["online", "offline"]
Severity = Literal["info", "warning", "critical"]
ArmingMode = Literal["disarmed", "armed_home", "armed_away"]
CameraSource = Literal["bcs", "onvif", "rtsp"]
RecorderSeries = Literal["bcs_point", "bcs_line", "other"]
SensorType = Literal["motion", "contact", "flood", "smoke", "temperature", "vibration"]
SensorState = Literal["idle", "triggered"]
AlarmStatus = Literal["active", "acknowledged", "resolved"]
AlarmSourceType = Literal["sensor", "camera", "network", "system"]
EventCategory = Literal["motion", "camera_offline", "device_online", "door", "alarm", "restart"]
NetworkDeviceType = Literal["core", "recorder", "camera", "router", "switch", "other"]
Role = Literal["admin", "viewer"]

STREAM_NAME_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"


class ApiModel(BaseModel):
    """Baza schematów: aliasy camelCase i pomijanie pól pustych.

    Frontend odróżnia pole nieobecne (`undefined`) od `null`, dlatego wartości None są
    pomijane w odpowiedzi – z wyjątkiem pól wymienionych w `keep_null`.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    keep_null: ClassVar[frozenset[str]] = frozenset()

    @model_serializer(mode="wrap")
    def _drop_none(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        data = handler(self)
        keep = self.keep_null | {to_camel(name) for name in self.keep_null}
        return {key: value for key, value in data.items() if value is not None or key in keep}


# ---------- Uwierzytelnianie ----------


class LoginRequest(ApiModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class UserOut(ApiModel):
    id: str
    username: str
    role: Role


class LoginResponse(ApiModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime
    user: UserOut


class ChangePasswordRequest(ApiModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=10, max_length=256)


class ApiTokenCreate(ApiModel):
    name: str = Field(min_length=1, max_length=100)
    role: Role = "viewer"


class ApiTokenOut(ApiModel):
    id: str
    name: str
    prefix: str
    role: Role
    created_at: datetime
    last_used_at: datetime | None = None


class ApiTokenCreated(ApiTokenOut):
    #: Pełna wartość tokenu – zwracana wyłącznie raz, przy utworzeniu.
    token: str


# ---------- System ----------


class CoreInfo(ApiModel):
    state: Literal["online", "degraded", "offline"]
    version: str
    hostname: str
    uptime_seconds: int


class Resources(ApiModel):
    cpu_percent: float
    memory_percent: float
    disk_percent: float


class CoreService(ApiModel):
    key: str
    name: str
    state: Literal["running", "stopped", "error"]


class AlarmSystemState(ApiModel):
    mode: ArmingMode
    changed_at: datetime
    changed_by: str | None = None


class SystemStatus(ApiModel):
    core: CoreInfo
    resources: Resources
    services: list[CoreService]
    alarm_system: AlarmSystemState
    server_time: datetime


class ArmingRequest(ApiModel):
    mode: ArmingMode


# ---------- Urządzenia ----------


class DeviceOut(ApiModel):
    keep_null: ClassVar[frozenset[str]] = frozenset({"last_seen_at"})

    id: str
    name: str
    kind: Literal["core", "recorder", "camera", "hub", "other"]
    vendor: str
    model: str
    firmware: str | None = None
    ip_address: str | None = None
    channels: int | None = None
    status: ConnectionStatus
    last_seen_at: datetime | None


# ---------- Rejestratory ----------


class RecorderOut(ApiModel):
    keep_null: ClassVar[frozenset[str]] = frozenset({"last_seen_at"})

    id: str
    name: str
    vendor: str
    series: RecorderSeries
    model: str
    firmware: str | None = None
    ip_address: str | None = None
    port: int | None = None
    channels: int | None = None
    username: str | None = None
    #: Czy zapisano hasło – samo hasło nigdy nie jest zwracane.
    has_password: bool
    status: ConnectionStatus
    last_seen_at: datetime | None


class RecorderCreate(ApiModel):
    name: str = Field(min_length=1, max_length=100)
    vendor: str = Field(default="BCS", max_length=64)
    series: RecorderSeries = "other"
    model: str = Field(default="", max_length=100)
    firmware: str | None = Field(default=None, max_length=64)
    ip_address: str | None = Field(default=None, max_length=45)
    port: int | None = Field(default=None, ge=1, le=65535)
    channels: int | None = Field(default=None, ge=1, le=256)
    username: str | None = Field(default=None, max_length=100)
    password: str | None = Field(default=None, max_length=256)


class RecorderUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    vendor: str | None = Field(default=None, max_length=64)
    series: RecorderSeries | None = None
    model: str | None = Field(default=None, max_length=100)
    firmware: str | None = Field(default=None, max_length=64)
    ip_address: str | None = Field(default=None, max_length=45)
    port: int | None = Field(default=None, ge=1, le=65535)
    channels: int | None = Field(default=None, ge=1, le=256)
    username: str | None = Field(default=None, max_length=100)
    #: Pusty tekst usuwa zapisane hasło.
    password: str | None = Field(default=None, max_length=256)
    status: ConnectionStatus | None = None


# ---------- Kamery ----------


class CameraOut(ApiModel):
    keep_null: ClassVar[frozenset[str]] = frozenset({"signal_quality", "last_seen_at"})

    id: str
    name: str
    location: str
    status: ConnectionStatus
    signal_quality: int | None
    source: CameraSource
    channel: int | None = None
    stream_name: str
    resolution: str | None = None
    fps: int | None = None
    recording: bool
    last_seen_at: datetime | None


class CameraCreate(ApiModel):
    name: str = Field(min_length=1, max_length=100)
    location: str = Field(default="", max_length=100)
    source: CameraSource = "rtsp"
    recorder_id: str | None = None
    channel: int | None = Field(default=None, ge=1, le=256)
    stream_name: str = Field(pattern=STREAM_NAME_PATTERN)
    #: Adres źródłowy strumienia – tylko do zapisu, przechowywany w postaci zaszyfrowanej.
    stream_url: str | None = Field(default=None, max_length=1024)
    ip_address: str | None = Field(default=None, max_length=45)
    vendor: str = Field(default="", max_length=64)
    model: str = Field(default="", max_length=100)
    resolution: str | None = Field(default=None, max_length=32)
    fps: int | None = Field(default=None, ge=1, le=240)
    recording: bool = False
    sort_order: int = 0


class CameraUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    location: str | None = Field(default=None, max_length=100)
    source: CameraSource | None = None
    recorder_id: str | None = None
    channel: int | None = Field(default=None, ge=1, le=256)
    stream_name: str | None = Field(default=None, pattern=STREAM_NAME_PATTERN)
    stream_url: str | None = Field(default=None, max_length=1024)
    ip_address: str | None = Field(default=None, max_length=45)
    vendor: str | None = Field(default=None, max_length=64)
    model: str | None = Field(default=None, max_length=100)
    resolution: str | None = Field(default=None, max_length=32)
    fps: int | None = Field(default=None, ge=1, le=240)
    recording: bool | None = None
    sort_order: int | None = None
    status: ConnectionStatus | None = None
    signal_quality: int | None = Field(default=None, ge=0, le=100)


# ---------- Czujniki ----------


class SensorOut(ApiModel):
    keep_null: ClassVar[frozenset[str]] = frozenset({"last_updated_at"})

    id: str
    name: str
    location: str
    type: SensorType
    state: SensorState
    value: float | None = None
    unit: str | None = None
    connection: ConnectionStatus
    battery_percent: int | None = None
    last_updated_at: datetime | None


class SensorCreate(ApiModel):
    name: str = Field(min_length=1, max_length=100)
    location: str = Field(default="", max_length=100)
    type: SensorType
    unit: str | None = Field(default=None, max_length=16)


class SensorUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    location: str | None = Field(default=None, max_length=100)
    unit: str | None = Field(default=None, max_length=16)
    connection: ConnectionStatus | None = None


class SensorReading(ApiModel):
    """Odczyt zgłaszany przez integrację (np. przyszły most MQTT)."""

    state: SensorState
    value: float | None = None
    battery_percent: int | None = Field(default=None, ge=0, le=100)


# ---------- Alarmy ----------


class AlarmSource(ApiModel):
    type: AlarmSourceType
    name: str
    id: str | None = None


class AlarmOut(ApiModel):
    id: str
    title: str
    description: str | None = None
    severity: Severity
    status: AlarmStatus
    source: AlarmSource
    location: str | None = None
    triggered_at: datetime
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
    resolved_at: datetime | None = None

    @classmethod
    def from_model(cls, alarm: models.Alarm) -> "AlarmOut":
        return cls(
            id=alarm.id,
            title=alarm.title,
            description=alarm.description,
            severity=alarm.severity,  # type: ignore[arg-type]
            status=alarm.status,  # type: ignore[arg-type]
            source=AlarmSource(type=alarm.source_type, name=alarm.source_name, id=alarm.source_id),  # type: ignore[arg-type]
            location=alarm.location,
            triggered_at=alarm.triggered_at,
            acknowledged_at=alarm.acknowledged_at,
            acknowledged_by=alarm.acknowledged_by,
            resolved_at=alarm.resolved_at,
        )


class AlarmCreate(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    severity: Severity
    source: AlarmSource
    location: str | None = Field(default=None, max_length=100)


# ---------- Zdarzenia ----------


class EventOut(ApiModel):
    id: str
    category: EventCategory
    severity: Severity
    title: str
    description: str | None = None
    source: str
    occurred_at: datetime


class EventCreate(ApiModel):
    category: EventCategory
    severity: Severity = "info"
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    source: str = Field(min_length=1, max_length=100)
    occurred_at: datetime | None = None


# ---------- Sieć ----------


class NetworkDeviceOut(ApiModel):
    keep_null: ClassVar[frozenset[str]] = frozenset({"last_seen_at"})

    id: str
    name: str
    type: NetworkDeviceType
    ip_address: str
    mac_address: str | None = None
    vendor: str
    status: ConnectionStatus
    latency_ms: int | None = None
    last_seen_at: datetime | None


class NetworkDeviceCreate(ApiModel):
    name: str = Field(min_length=1, max_length=100)
    type: NetworkDeviceType = "other"
    ip_address: str = Field(min_length=1, max_length=45)
    mac_address: str | None = Field(default=None, max_length=17)
    vendor: str = Field(default="", max_length=64)


class NetworkDeviceUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    type: NetworkDeviceType | None = None
    ip_address: str | None = Field(default=None, min_length=1, max_length=45)
    mac_address: str | None = Field(default=None, max_length=17)
    vendor: str | None = Field(default=None, max_length=64)
    status: ConnectionStatus | None = None
    latency_ms: int | None = Field(default=None, ge=0)


def dump(model: ApiModel) -> dict[str, Any]:
    """Postać JSON schematu (camelCase) – do komunikatów WebSocket."""
    return model.model_dump(mode="json", by_alias=True)
