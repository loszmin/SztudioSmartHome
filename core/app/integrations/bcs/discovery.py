"""Wyszukiwanie rejestratorów w sieci.

Rejestratory nie mają własnego, udokumentowanego tu protokołu wykrywania – korzystamy ze standardowego
WS-Discovery (ONVIF). Urządzenie jest oznaczane jako „prawdopodobnie BCS” wyłącznie na podstawie
nazwy i oznaczenia sprzętu, które samo rozgłasza; nie jest to potwierdzenie modelu.
"""

from dataclasses import dataclass

from app.integrations.onvif.discovery import DiscoveredDevice, discover


@dataclass
class DiscoveredRecorder:
    device: DiscoveredDevice
    likely_bcs: bool


def looks_like_bcs(device: DiscoveredDevice) -> bool:
    described = " ".join(filter(None, [device.name, device.hardware])).lower()
    return "bcs" in described


async def discover_recorders(
    *, multicast: bool = True, hosts: list[str] | None = None, timeout: float = 3.0
) -> list[DiscoveredRecorder]:
    devices = await discover(multicast=multicast, hosts=hosts, timeout=timeout)
    return [DiscoveredRecorder(device, looks_like_bcs(device)) for device in devices]
