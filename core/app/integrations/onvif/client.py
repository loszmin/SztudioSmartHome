"""Odczyt informacji o urządzeniu ONVIF i jego profili mediów (biblioteka onvif-zeep-async)."""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from app.integrations.errors import IntegrationError
from app.integrations.rtsp import RtspUrlError, parse_rtsp_url

logger = logging.getLogger(__name__)


class OnvifError(IntegrationError):
    pass


@dataclass
class OnvifProfile:
    token: str
    name: str
    #: Identyfikator źródła wideo – na rejestratorach odpowiada kanałowi.
    video_source: str | None = None
    encoding: str | None = None
    resolution: str | None = None
    fps: int | None = None
    #: Port i ścieżka RTSP z adresu podanego przez urządzenie. Host z odpowiedzi jest ignorowany.
    rtsp_port: int | None = None
    rtsp_path: str | None = None
    #: Powód braku adresu strumienia, jeżeli urządzenie go nie podało.
    error: str | None = None


@dataclass
class OnvifDevice:
    manufacturer: str | None = None
    model: str | None = None
    firmware: str | None = None
    serial_number: str | None = None
    profiles: list[OnvifProfile] = field(default_factory=list)


def _get(obj: Any, *path: str) -> Any:
    """Bezpieczny odczyt zagnieżdżonego pola – urządzenia pomijają różne części odpowiedzi."""
    for name in path:
        if obj is None:
            return None
        obj = obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)
    return obj


def _text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


_AUTH_MARKERS = (
    "notauthorized",
    "not authorized",
    "unauthorized",
    "authority failure",
    "wrong username",
    "password",
)


def _chain(error: BaseException) -> list[BaseException]:
    seen: list[BaseException] = []
    current: BaseException | None = error
    while current is not None and current not in seen:
        seen.append(current)
        current = current.__cause__ or current.__context__
    return seen


def _classify(error: Exception) -> OnvifError:
    """Zamienia wyjątki biblioteki ONVIF, zeep i warstwy sieciowej na błąd z kodem diagnostycznym."""
    if isinstance(error, OnvifError):
        return error
    for item in _chain(error):
        name = type(item).__name__
        text = str(item).lower()
        status = getattr(item, "status_code", None)
        if isinstance(item, asyncio.TimeoutError | TimeoutError) or name in (
            "ONVIFTimeoutError",
            "ServerTimeoutError",
        ):
            return OnvifError(
                "timeout", "Urządzenie nie odpowiedziało na zapytanie ONVIF w wyznaczonym czasie."
            )
        if isinstance(item, ConnectionRefusedError):
            return OnvifError("connection_refused", "Urządzenie odrzuciło połączenie na porcie ONVIF.")
        if name == "ONVIFAuthError" or status in (401, 403):
            return OnvifError("auth_failed", "Urządzenie odrzuciło login lub hasło ONVIF.")
        if name == "Fault":
            if any(marker in text for marker in _AUTH_MARKERS):
                return OnvifError("auth_failed", "Urządzenie odrzuciło login lub hasło ONVIF.")
            return OnvifError("onvif_error", "Urządzenie zwróciło błąd ONVIF.")
        if name == "TransportError" or name in ("XMLSyntaxError", "XMLParseError", "ContentTypeError"):
            return OnvifError("not_onvif", "Pod tym adresem i portem nie odpowiada usługa ONVIF.")
        if isinstance(item, OSError) and name != "ClientConnectorError":
            return OnvifError("unreachable", "Urządzenie jest nieosiągalne albo port ONVIF jest zamknięty.")
    if any(type(item).__name__.startswith("Client") for item in _chain(error)):
        return OnvifError("unreachable", "Urządzenie jest nieosiągalne albo port ONVIF jest zamknięty.")
    logger.info("Nierozpoznany błąd ONVIF: %s", type(error).__name__)
    return OnvifError("onvif_error", "Urządzenie zwróciło błąd ONVIF.")


async def _inspect(ip: str, port: int, username: str | None, password: str | None) -> OnvifDevice:
    # Import w funkcji: biblioteka wczytuje definicje WSDL i jest potrzebna tylko przy pracy z ONVIF.
    from onvif import ONVIFCamera

    # nat_override: adresy usług podane przez urządzenie są zastępowane adresem, z którym się łączymy –
    # urządzenie nie może skierować Core pod inny host.
    camera = ONVIFCamera(ip, port, username or "", password or "", nat_override=True)
    try:
        await camera.update_xaddrs()
        management = await camera.create_devicemgmt_service()
        info = await management.GetDeviceInformation()
        device = OnvifDevice(
            manufacturer=_text(_get(info, "Manufacturer")),
            model=_text(_get(info, "Model")),
            firmware=_text(_get(info, "FirmwareVersion")),
            serial_number=_text(_get(info, "SerialNumber")),
        )

        try:
            media = await camera.create_media_service()
        except Exception as error:  # noqa: BLE001
            raise OnvifError("media_unsupported", "Urządzenie nie udostępnia usługi mediów ONVIF.") from error

        for item in await media.GetProfiles() or []:
            token = _text(_get(item, "token"))
            if not token:
                continue
            width = _get(item, "VideoEncoderConfiguration", "Resolution", "Width")
            height = _get(item, "VideoEncoderConfiguration", "Resolution", "Height")
            fps = _get(item, "VideoEncoderConfiguration", "RateControl", "FrameRateLimit")
            profile = OnvifProfile(
                token=token,
                name=_text(_get(item, "Name")) or token,
                video_source=_text(_get(item, "VideoSourceConfiguration", "SourceToken")),
                encoding=_text(_get(item, "VideoEncoderConfiguration", "Encoding")),
                resolution=f"{width}×{height}" if width and height else None,
                fps=int(fps) if fps else None,
            )
            try:
                uri = await media.GetStreamUri(
                    {
                        "StreamSetup": {"Stream": "RTP-Unicast", "Transport": {"Protocol": "RTSP"}},
                        "ProfileToken": token,
                    }
                )
                target = parse_rtsp_url(str(_get(uri, "Uri") or ""))
                profile.rtsp_port, profile.rtsp_path = target.port, target.path
            except RtspUrlError:
                profile.error = "Urządzenie podało adres strumienia w nieobsługiwanym formacie."
            except Exception as error:  # noqa: BLE001 – brak adresu jednego profilu nie przekreśla pozostałych
                profile.error = _classify(error).message
            device.profiles.append(profile)
        return device
    finally:
        try:
            await camera.close()
        except Exception:  # noqa: BLE001, S110
            pass


async def inspect_device(
    ip: str, port: int, username: str | None, password: str | None, timeout: float = 20.0
) -> OnvifDevice:
    """Łączy się z urządzeniem ONVIF pod zweryfikowanym adresem `ip` i odczytuje dane oraz profile."""
    try:
        return await asyncio.wait_for(_inspect(ip, port, username, password), timeout)
    except Exception as error:  # noqa: BLE001
        raise _classify(error) from error
