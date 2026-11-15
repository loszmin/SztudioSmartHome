"""WS-Discovery dla urządzeń ONVIF.

Dwa tryby:
- multicast (239.255.255.250:3702) – działa tylko w tej samej domenie rozgłoszeniowej; nie przechodzi
  przez routery, VLAN-y ani mostkową sieć Dockera,
- unicast – zapytanie wysyłane kolejno na każdy adres wskazanej podsieci; działa przez routing
  i z kontenera, pod warunkiem że urządzenie odpowiada na zapytania kierowane (większość, nie wszystkie).
"""

import asyncio
import re
import socket
import uuid
from dataclasses import dataclass, field
from urllib.parse import unquote, urlsplit

from defusedxml import ElementTree

MULTICAST_GROUP = "239.255.255.250"
WS_DISCOVERY_PORT = 3702
DEFAULT_ONVIF_PORT = 80

_NS = {
    "s": "http://www.w3.org/2003/05/soap-envelope",
    "a": "http://schemas.xmlsoap.org/ws/2004/08/addressing",
    "d": "http://schemas.xmlsoap.org/ws/2005/04/discovery",
}

_PROBE = """<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
<s:Header><a:MessageID>urn:uuid:{message_id}</a:MessageID><a:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To><a:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action></s:Header>
<s:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></s:Body>
</s:Envelope>"""


@dataclass
class DiscoveredDevice:
    #: Adres źródłowy odpowiedzi – jedyny adres, któremu ufamy (nie adresowi z treści komunikatu).
    ip: str
    onvif_port: int = DEFAULT_ONVIF_PORT
    name: str | None = None
    hardware: str | None = None
    location: str | None = None
    endpoint: str | None = None
    types: list[str] = field(default_factory=list)
    scopes: list[str] = field(default_factory=list)


def _scope_value(scopes: list[str], key: str) -> str | None:
    prefix = f"onvif://www.onvif.org/{key}/"
    for scope in scopes:
        if scope.lower().startswith(prefix):
            return unquote(scope[len(prefix) :]).strip() or None
    return None


def parse_probe_matches(payload: bytes, source_ip: str) -> list[DiscoveredDevice]:
    """Rozkłada odpowiedź ProbeMatches. Niepoprawne dane są pomijane – pochodzą z niezaufanej sieci."""
    try:
        root = ElementTree.fromstring(payload)
    except Exception:  # noqa: BLE001 – dowolny błąd parsowania = brak wyniku
        return []
    devices = []
    for match in root.iterfind(".//d:ProbeMatch", _NS):
        scopes = (match.findtext("d:Scopes", "", _NS) or "").split()
        types = [item.split(":")[-1] for item in (match.findtext("d:Types", "", _NS) or "").split()]
        port = DEFAULT_ONVIF_PORT
        for xaddr in (match.findtext("d:XAddrs", "", _NS) or "").split():
            try:
                parts = urlsplit(xaddr)
                port = parts.port or (443 if parts.scheme == "https" else DEFAULT_ONVIF_PORT)
                break
            except ValueError:
                continue
        devices.append(
            DiscoveredDevice(
                ip=source_ip,
                onvif_port=port,
                name=_scope_value(scopes, "name"),
                hardware=_scope_value(scopes, "hardware"),
                location=_scope_value(scopes, "location"),
                endpoint=match.findtext("a:EndpointReference/a:Address", None, _NS),
                types=types,
                scopes=scopes[:32],
            )
        )
    return devices


class _Collector(asyncio.DatagramProtocol):
    def __init__(self) -> None:
        self.devices: dict[str, DiscoveredDevice] = {}

    def datagram_received(self, data: bytes, addr: tuple) -> None:
        for device in parse_probe_matches(data, addr[0]):
            self.devices.setdefault(device.ip, device)

    def error_received(self, exc: Exception) -> None:  # ICMP „port unreachable” przy skanowaniu – oczekiwane
        pass


async def discover(
    *,
    multicast: bool = True,
    hosts: list[str] | None = None,
    timeout: float = 3.0,
    port: int = WS_DISCOVERY_PORT,
) -> list[DiscoveredDevice]:
    """Wysyła zapytanie WS-Discovery i zbiera odpowiedzi przez `timeout` sekund."""
    loop = asyncio.get_running_loop()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setblocking(False)
    sock.bind(("0.0.0.0", 0))
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    transport, collector = await loop.create_datagram_endpoint(_Collector, sock=sock)
    try:
        probe = _PROBE.format(message_id=uuid.uuid4()).encode()
        if multicast:
            try:
                transport.sendto(probe, (MULTICAST_GROUP, port))
            except OSError:
                pass  # brak trasy multicast (np. kontener bez dostępu do sieci LAN)
        for index, host in enumerate(hosts or []):
            try:
                transport.sendto(probe, (host, port))
            except OSError:
                continue
            if index % 64 == 63:
                await asyncio.sleep(0.02)  # nie zalewamy sieci przy skanowaniu większych podsieci
        await asyncio.sleep(timeout)
    finally:
        transport.close()
    return sorted(
        collector.devices.values(),
        key=lambda device: tuple(int(part) for part in re.findall(r"\d+", device.ip)),
    )
