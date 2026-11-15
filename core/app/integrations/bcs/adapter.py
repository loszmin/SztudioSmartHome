"""Adaptery rejestratorów.

Wszystkie serie korzystają dziś z tej samej implementacji opartej na protokołach standardowych
(ONVIF do odczytu kanałów, RTSP do obrazu). Klasy `BcsPointAdapter` i `BcsLineAdapter` istnieją po to,
by po poznaniu konkretnego modelu dodać w nich obsługę API producenta – do tego czasu funkcje
wymagające takiego API zgłaszają `BcsNotImplementedError`, zamiast udawać działanie.
"""

from typing import ClassVar

from app.integrations.bcs.client import BcsProtocolClient
from app.integrations.bcs.exceptions import BcsError, BcsNotImplementedError
from app.integrations.bcs.schemas import ChannelProfile, RecorderChannel, RecorderDeviceInfo, RecorderProbe
from app.integrations.onvif.client import OnvifDevice
from app.integrations.rtsp import RtspUrlError, normalize_path

#: Informacje potrzebne do przygotowania adaptera konkretnego modelu rejestratora.
REQUIRED_INFORMATION: tuple[str, ...] = (
    "Dokładne oznaczenie modelu rejestratora (z tabliczki znamionowej lub ekranu „Informacje o systemie”).",
    "Seria: BCS Point czy BCS Line oraz wersja oprogramowania (firmware).",
    "Porty usług ustawione w rejestratorze: HTTP, RTSP, ONVIF (Sieć → Porty).",
    "Czy ONVIF jest włączony i czy ma osobne konto użytkownika.",
    "Format adresu RTSP z instrukcji modelu (strumień główny i pomocniczy dla wybranego kanału).",
    "Liczba kanałów i sposób podłączenia kamer (porty PoE rejestratora czy sieć LAN).",
    "Wynik testu połączenia z tego panelu (lista protokołów ze stanem) po podaniu danych logowania.",
)

#: Funkcje, których nie da się zrealizować protokołami standardowymi.
VENDOR_FEATURES: tuple[str, ...] = (
    "Zdarzenia z rejestratora (detekcja ruchu, alarmy wejść)",
    "Odtwarzanie i wyszukiwanie nagrań",
    "Stan dysków i nagrywania",
    "Sterowanie PTZ przez rejestrator",
    "Zmiana konfiguracji rejestratora",
)

TEMPLATE_SUBTYPES = (("Strumień główny", 0), ("Strumień pomocniczy", 1))


def render_path_template(template: str, channel: int, subtype: int) -> str:
    """Podstawia numer kanału i typ strumienia do szablonu ścieżki RTSP podanego przez użytkownika."""
    if "{channel}" not in template:
        raise RtspUrlError("Szablon ścieżki RTSP musi zawierać pole {channel}.")
    return normalize_path(template.replace("{channel}", str(channel)).replace("{subtype}", str(subtype)))


class RecorderAdapter:
    """Adapter oparty na protokołach standardowych."""

    series: ClassVar[str] = "other"
    label: ClassVar[str] = "Rejestrator (protokoły standardowe)"
    #: Ustawiane na True dopiero po teście adaptera z rzeczywistym urządzeniem danej serii.
    hardware_verified: ClassVar[bool] = False

    def __init__(
        self,
        client: BcsProtocolClient,
        *,
        rtsp_path_template: str | None = None,
        channel_count: int | None = None,
    ) -> None:
        self.client = client
        self.rtsp_path_template = rtsp_path_template
        self.channel_count = channel_count

    async def probe(self, *, deep: bool = True) -> tuple[RecorderProbe, OnvifDevice | None]:
        """Sprawdza protokoły. `deep=False` pomija ONVIF (lżejsza kontrola cykliczna)."""
        checks = [await self.client.check_http(), await self.client.check_rtsp()]
        device: OnvifDevice | None = None
        if deep:
            onvif_check, device = await self.client.check_onvif()
            checks.append(onvif_check)

        reachable = any(check.state in ("ok", "auth_failed") for check in checks)
        auth_failed = any(check.state == "auth_failed" for check in checks)
        if not reachable:
            code, message = "unreachable", "Rejestrator nie odpowiada na żadnym ze sprawdzanych portów."
        elif auth_failed:
            code, message = "auth_failed", "Rejestrator odpowiada, ale odrzucił login lub hasło."
        else:
            code, message = "ok", "Rejestrator odpowiada."
        info = (
            RecorderDeviceInfo(
                manufacturer=device.manufacturer,
                model=device.model,
                firmware=device.firmware,
                serial_number=device.serial_number,
            )
            if device
            else None
        )
        return (
            RecorderProbe(
                reachable=reachable,
                code=code,
                message=message,
                checks=checks,
                device=info,
                adapter=self.series,
                hardware_verified=self.hardware_verified,
            ),  # fmt: skip
            device,
        )

    async def list_channels(self) -> list[RecorderChannel]:
        """Kanały rejestratora: z ONVIF, a gdy to niemożliwe – z szablonu ścieżki i liczby kanałów."""
        check, device = await self.client.check_onvif()
        if device and device.profiles:
            return self._channels_from_onvif(device)
        if self.rtsp_path_template and self.channel_count:
            return self._channels_from_template()
        raise BcsError(
            "channels_unavailable",
            f"Nie udało się odczytać kanałów przez ONVIF ({check.detail}) – "
            "włącz ONVIF w rejestratorze albo podaj szablon ścieżki RTSP i liczbę kanałów.",
        )

    @staticmethod
    def _channels_from_onvif(device: OnvifDevice) -> list[RecorderChannel]:
        grouped: dict[str, list[ChannelProfile]] = {}
        for profile in device.profiles:
            grouped.setdefault(profile.video_source or profile.token, []).append(
                ChannelProfile(
                    name=profile.name,
                    token=profile.token,
                    encoding=profile.encoding,
                    resolution=profile.resolution,
                    fps=profile.fps,
                    rtsp_port=profile.rtsp_port,
                    rtsp_path=profile.rtsp_path,
                    error=profile.error,
                )  # fmt: skip
            )
        return [
            RecorderChannel(number=index, name=f"Kanał {index}", origin="onvif", profiles=profiles)
            for index, profiles in enumerate(grouped.values(), start=1)
        ]

    def _channels_from_template(self) -> list[RecorderChannel]:
        assert self.rtsp_path_template and self.channel_count
        return [
            RecorderChannel(
                number=number,
                name=f"Kanał {number}",
                origin="template",
                profiles=[
                    ChannelProfile(
                        name=name,
                        rtsp_port=self.client.rtsp_port,
                        rtsp_path=render_path_template(self.rtsp_path_template, number, subtype),
                    )  # fmt: skip
                    for name, subtype in TEMPLATE_SUBTYPES
                ],
            )
            for number in range(1, self.channel_count + 1)
        ]

    async def vendor_feature(self, feature: str) -> None:
        """Punkt zaczepienia dla funkcji API producenta – jeszcze niezaimplementowanych."""
        raise BcsNotImplementedError(feature)


class BcsPointAdapter(RecorderAdapter):
    series: ClassVar[str] = "bcs_point"
    label: ClassVar[str] = "BCS Point (protokoły standardowe – API producenta nieobsługiwane)"


class BcsLineAdapter(RecorderAdapter):
    series: ClassVar[str] = "bcs_line"
    label: ClassVar[str] = "BCS Line (protokoły standardowe – API producenta nieobsługiwane)"


ADAPTERS: dict[str, type[RecorderAdapter]] = {
    adapter.series: adapter for adapter in (RecorderAdapter, BcsPointAdapter, BcsLineAdapter)
}


def adapter_for(series: str) -> type[RecorderAdapter]:
    return ADAPTERS.get(series, RecorderAdapter)
