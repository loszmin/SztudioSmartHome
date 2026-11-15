"""Weryfikacja protokołów dostępnych na rejestratorze.

Klient sprawdza wyłącznie protokoły standardowe. Zapytanie HTTP potwierdza tylko, że pod wskazanym
portem działa serwer WWW urządzenia – nie korzysta z żadnego API producenta.
"""

import time
from dataclasses import dataclass, field

import httpx

from app.integrations.bcs.schemas import ProtocolCheck
from app.integrations.onvif.client import OnvifDevice, OnvifError, inspect_device
from app.integrations.rtsp import RtspTarget, probe_rtsp

DEFAULT_HTTP_PORT = 80
DEFAULT_RTSP_PORT = 554
DEFAULT_ONVIF_PORT = 80

_RTSP_STATES = {
    "ok": "ok",
    "auth_failed": "auth_failed",
    "auth_required": "auth_failed",
    "connection_refused": "closed",
    "timeout": "timeout",
    "unreachable": "timeout",
}
_ONVIF_STATES = {
    "auth_failed": "auth_failed",
    "connection_refused": "closed",
    "unreachable": "closed",
    "timeout": "timeout",
}


@dataclass
class BcsProtocolClient:
    #: Adres IP po weryfikacji polityki sieciowej.
    ip: str
    http_port: int = DEFAULT_HTTP_PORT
    rtsp_port: int = DEFAULT_RTSP_PORT
    onvif_port: int = DEFAULT_ONVIF_PORT
    username: str | None = None
    password: str | None = field(default=None, repr=False)
    timeout: float = 5.0
    transport: httpx.AsyncBaseTransport | None = None

    async def check_http(self) -> ProtocolCheck:
        started = time.monotonic()
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout, transport=self.transport, trust_env=False
            ) as client:
                response = await client.get(f"http://{self.ip}:{self.http_port}/", follow_redirects=False)
        except httpx.TimeoutException:
            return ProtocolCheck(
                protocol="http", port=self.http_port, state="timeout", detail="Brak odpowiedzi HTTP."
            )
        except httpx.ConnectError:
            return ProtocolCheck(
                protocol="http",
                port=self.http_port,
                state="closed",
                detail="Port HTTP jest zamknięty lub nieosiągalny.",
            )
        except httpx.HTTPError:
            return ProtocolCheck(
                protocol="http",
                port=self.http_port,
                state="error",
                detail="Urządzenie nie odpowiada poprawnie po HTTP.",
            )
        return ProtocolCheck(
            protocol="http",
            port=self.http_port,
            state="ok",
            detail=f"Interfejs WWW odpowiada (HTTP {response.status_code}).",
            response_time_ms=int((time.monotonic() - started) * 1000),
            server=response.headers.get("server"),
        )

    async def check_rtsp(self) -> ProtocolCheck:
        target = RtspTarget(self.ip, self.rtsp_port, "/", self.username, self.password)
        result = await probe_rtsp(target, self.ip, self.timeout, method="OPTIONS")
        return ProtocolCheck(
            protocol="rtsp",
            port=self.rtsp_port,
            state=_RTSP_STATES.get(result.code, "error"),  # type: ignore[arg-type]
            detail="Usługa RTSP odpowiada." if result.ok else result.message,
            response_time_ms=result.response_time_ms,
            server=result.server,
        )

    async def check_onvif(self) -> tuple[ProtocolCheck, OnvifDevice | None]:
        started = time.monotonic()
        try:
            device = await inspect_device(
                self.ip, self.onvif_port, self.username, self.password, timeout=self.timeout * 4
            )
        except OnvifError as error:
            state = _ONVIF_STATES.get(error.code, "error")
            return ProtocolCheck(
                protocol="onvif", port=self.onvif_port, state=state, detail=error.message
            ), None  # type: ignore[arg-type]
        profiles = len(device.profiles)
        return (
            ProtocolCheck(
                protocol="onvif",
                port=self.onvif_port,
                state="ok",
                detail=f"ONVIF odpowiada – profile mediów: {profiles}.",
                response_time_ms=int((time.monotonic() - started) * 1000),
            ),
            device,
        )
