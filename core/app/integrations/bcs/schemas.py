from typing import Literal

from pydantic import Field

from app.schemas import ApiModel

ProtocolName = Literal["http", "rtsp", "onvif"]
ProtocolState = Literal["ok", "auth_failed", "closed", "timeout", "error", "skipped"]


class ProtocolCheck(ApiModel):
    """Wynik weryfikacji jednego protokołu na rejestratorze."""

    protocol: ProtocolName
    port: int
    state: ProtocolState
    detail: str
    response_time_ms: int | None = None
    #: Nagłówek Server zwrócony przez urządzenie (jeśli podało).
    server: str | None = None


class RecorderDeviceInfo(ApiModel):
    manufacturer: str | None = None
    model: str | None = None
    firmware: str | None = None
    serial_number: str | None = None


class RecorderProbe(ApiModel):
    """Zbiorczy wynik testu połączenia z rejestratorem."""

    #: Urządzenie odpowiada na co najmniej jednym protokole.
    reachable: bool
    code: str
    message: str
    checks: list[ProtocolCheck]
    #: Dane odczytane przez ONVIF (jeśli rejestrator go obsługuje i przyjął dane logowania).
    device: RecorderDeviceInfo | None = None
    #: Seria wybrana w konfiguracji i informacja, czy adapter tej serii przeszedł test ze sprzętem.
    adapter: str
    hardware_verified: bool = False


class ChannelProfile(ApiModel):
    name: str
    token: str | None = None
    encoding: str | None = None
    resolution: str | None = None
    fps: int | None = None
    rtsp_port: int | None = None
    rtsp_path: str | None = None
    error: str | None = None


class RecorderChannel(ApiModel):
    number: int = Field(ge=1)
    name: str
    #: `onvif` – odczytane z rejestratora; `template` – wyliczone z szablonu ścieżki (niezweryfikowane).
    origin: Literal["onvif", "template"]
    profiles: list[ChannelProfile]
    #: Identyfikator kamery w systemie, jeżeli kanał został już dodany.
    camera_id: str | None = None
