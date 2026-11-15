"""Testy warstwy integracji bez bazy danych: RTSP, ochrona adresów, go2rtc, ONVIF.

Urządzenia są atrapami mówiącymi prawdziwymi protokołami przez gniazda na 127.0.0.1.
"""

import asyncio
import socket

import httpx
import pytest

from app.integrations.errors import IntegrationError
from app.integrations.go2rtc import Go2rtcClient, Go2rtcError, redact_url
from app.integrations.netguard import AddressNotAllowed, AddressPolicy
from app.integrations.onvif.client import OnvifError, inspect_device
from app.integrations.onvif.discovery import discover, parse_probe_matches
from app.integrations.rtsp import (
    RtspTarget,
    RtspUrlError,
    normalize_path,
    parse_rtsp_url,
    probe_rtsp,
    quality_from_response_time,
)
from tests.fakes import FakeOnvifDevice, FakeOnvifProfile

LAN = AddressPolicy.from_strings("10.0.0.0/8,172.16.0.0/12,192.168.0.0/16", "172.31.250.0/24")


# ---------- walidacja adresów RTSP ----------


def test_rtsp_url_is_split_into_components():
    target = parse_rtsp_url(
        "rtsp://adm%40in:p%3Ass%2Fword@192.168.1.64:8554/cam/realmonitor?channel=1&subtype=0"
    )
    assert (target.host, target.port, target.path) == (
        "192.168.1.64",
        8554,
        "/cam/realmonitor?channel=1&subtype=0",
    )
    assert (target.username, target.password) == ("adm@in", "p:ss/word")
    # Domyślny port i ścieżka.
    assert (parse_rtsp_url("rtsp://192.168.1.64").port, parse_rtsp_url("rtsp://192.168.1.64").path) == (
        554,
        "/",
    )


def test_rtsp_target_never_shows_password_unless_asked():
    target = RtspTarget("192.168.1.64", 554, "/s", "admin", "tajne:haslo@1")
    assert target.url() == "rtsp://192.168.1.64:554/s"
    assert "tajne" not in repr(target)
    # Znaki specjalne w danych logowania są kodowane – nie mogą zmienić hosta w adresie.
    assert target.url(credentials=True) == "rtsp://admin:tajne%3Ahaslo%401@192.168.1.64:554/s"
    assert target.url(credentials=True, host="10.0.0.5").startswith(
        "rtsp://admin:tajne%3Ahaslo%401@10.0.0.5:554"
    )


@pytest.mark.parametrize(
    "url",
    [
        "http://192.168.1.64/stream",  # inny schemat
        "rtsps://192.168.1.64/stream",
        "exec:ffmpeg -i /etc/passwd",  # źródło go2rtc uruchamiające polecenie
        "ffmpeg:rtsp://192.168.1.64/stream",
        "file:///etc/passwd",
        "rtsp:///stream",  # brak hosta
        "rtsp://192.168.1.64:99999/stream",  # port poza zakresem
        "rtsp://192.168.1.64/stream#fragment",
        "rtsp://192.168.1.64/a b",  # spacja
        "",
    ],
)
def test_rtsp_url_validation_rejects_unsafe_input(url):
    with pytest.raises(RtspUrlError):
        parse_rtsp_url(url)


def test_rtsp_path_normalization():
    assert normalize_path("stream1") == "/stream1"
    assert normalize_path(None) == "/"
    for bad in ("/a\r\nDESCRIBE", "rtsp://inny-host/x", "/a#b", "/" + "x" * 2000):
        with pytest.raises(RtspUrlError):
            normalize_path(bad)


# ---------- ochrona przed SSRF ----------


@pytest.mark.parametrize("address", ["192.168.1.64", "10.20.30.40", "172.16.5.5"])
def test_lan_addresses_are_allowed(address):
    assert LAN.resolve(address) == address


@pytest.mark.parametrize(
    "address",
    [
        "8.8.8.8",  # internet
        "127.0.0.1",  # pętla zwrotna – usługi samego serwera
        "169.254.169.254",  # metadane chmury / link-local
        "172.31.250.10",  # wewnętrzna sieć Compose (baza, go2rtc)
        "224.0.0.1",  # multicast
        "0.0.0.0",
        "::1",
    ],
)
def test_addresses_outside_device_networks_are_rejected(address):
    with pytest.raises(AddressNotAllowed) as error:
        LAN.resolve(address)
    assert error.value.code == "address_not_allowed"


def test_hostname_is_rejected_when_any_resolved_address_is_forbidden(monkeypatch):
    def fake_getaddrinfo(host, *args, **kwargs):
        answers = {"kamera.lan": ["192.168.1.64"], "podstep.example": ["192.168.1.64", "127.0.0.1"]}
        if host not in answers:
            raise socket.gaierror
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0)) for ip in answers[host]]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    assert LAN.resolve("kamera.lan") == "192.168.1.64"
    with pytest.raises(AddressNotAllowed):
        LAN.resolve("podstep.example")
    with pytest.raises(IntegrationError) as error:
        LAN.resolve("nie-istnieje.lan")
    assert error.value.code == "dns_error"


def test_subnet_scan_is_limited_to_allowed_networks_and_size():
    hosts = LAN.check_network("192.168.1.0/29", max_hosts=1024)
    assert hosts == [f"192.168.1.{n}" for n in range(1, 7)]
    assert LAN.check_network("172.31.250.0/30", 1024) == []  # sieć wykluczona
    for network, code in [
        ("8.8.8.0/24", "address_not_allowed"),
        ("10.0.0.0/8", "network_too_large"),
        ("abc", "address_invalid"),
    ]:
        with pytest.raises(AddressNotAllowed) as error:
            LAN.check_network(network, max_hosts=1024)
        assert error.value.code == code


# ---------- test połączenia RTSP ----------


def probe(server, path="/stream1", username="kamera", password="tajne-haslo", timeout=1.0):
    target = RtspTarget("127.0.0.1", server.port, path, username, password)
    return asyncio.run(probe_rtsp(target, "127.0.0.1", timeout))


@pytest.mark.parametrize("auth", ["digest", "basic"])
def test_probe_succeeds_with_valid_credentials(rtsp_server, auth):
    rtsp_server.auth = auth
    result = probe(rtsp_server)
    assert result.ok and result.code == "ok" and result.response_time_ms is not None
    assert result.tracks == [
        {"media": "video", "codec": "H264"},
        {"media": "audio", "codec": "MPEG4-GENERIC"},
    ]
    assert result.server == "AtrapaRTSP/1.0"
    # Adres w żądaniu nie zawiera danych logowania.
    assert all("tajne-haslo" not in line and "kamera@" not in line for line in rtsp_server.requests)


def test_probe_reports_specific_failures(rtsp_server):
    assert probe(rtsp_server, password="zle-haslo").code == "auth_failed"
    assert probe(rtsp_server, username=None, password=None).code == "auth_required"
    assert probe(rtsp_server, path="/nie-ma").code == "stream_not_found"
    assert probe(rtsp_server, path="/cam/realmonitor?channel=1&subtype=0").ok

    rtsp_server.mode = "garbage"
    assert probe(rtsp_server).code == "protocol_error"
    rtsp_server.mode = "hang"
    timed_out = probe(rtsp_server, timeout=0.3)
    assert timed_out.code == "timeout" and not timed_out.ok


def test_probe_reports_closed_port(rtsp_server, fake_loop):
    fake_loop.run(rtsp_server.stop())
    result = probe(rtsp_server)
    assert (result.ok, result.code, result.response_time_ms) == (False, "connection_refused", None)


def test_quality_is_derived_from_response_time():
    assert [quality_from_response_time(ms) for ms in (None, 20, 250, 700, 1500, 9000)] == [
        None,
        100,
        85,
        65,
        45,
        25,
    ]


# ---------- klient go2rtc ----------


def go2rtc_client(handler):
    return Go2rtcClient("http://go2rtc:1984", "core", "sekret-api", transport=httpx.MockTransport(handler))


def test_go2rtc_stream_management_requests():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.method == "GET" and request.url.path == "/api/streams":
            return httpx.Response(
                200,
                json={
                    "cam_a": {"producers": [{"url": "rtsp://***@192.168.1.64:554/s"}], "consumers": None},
                    "cam_b": {
                        "producers": [{"url": "rtsp://192.168.1.65:554/s", "medias": ["video"]}],
                        "consumers": [{}, {}],
                    },
                },
            )
        return httpx.Response(200, json={"version": "1.9.15"})

    async def scenario():
        client = go2rtc_client(handler)
        assert (await client.info())["version"] == "1.9.15"
        await client.put_stream("cam_a", "rtsp://admin:haslo@192.168.1.64:554/s")
        streams = await client.list_streams()
        await client.delete_stream("cam_a")
        await client.close()
        return streams

    streams = asyncio.run(scenario())
    assert streams["cam_a"].sources == ("rtsp://192.168.1.64:554/s",) and not streams["cam_a"].connected
    assert streams["cam_b"].consumers == 2 and streams["cam_b"].connected

    put = next(request for request in seen if request.method == "PUT")
    assert dict(put.url.params) == {"name": "cam_a", "src": "rtsp://admin:haslo@192.168.1.64:554/s"}
    assert all(request.headers["authorization"].startswith("Basic ") for request in seen)
    delete = next(request for request in seen if request.method == "DELETE")
    assert dict(delete.url.params) == {"src": "cam_a"}


@pytest.mark.parametrize(
    "source", ["exec:ffmpeg -i x", "ffmpeg:rtsp://192.168.1.64/s", "http://192.168.1.64/x", "echo:whoami"]
)
def test_go2rtc_client_only_passes_rtsp_sources(source):
    """go2rtc potrafi uruchamiać polecenia jako źródła – klient Core nigdy ich nie przekazuje."""
    calls = []

    async def scenario():
        client = go2rtc_client(lambda request: calls.append(request) or httpx.Response(200))
        with pytest.raises(Go2rtcError):
            await client.put_stream("cam_a", source)
        with pytest.raises(Go2rtcError):
            await client.put_stream("../zla nazwa", "rtsp://192.168.1.64/s")

    asyncio.run(scenario())
    assert calls == []


def test_go2rtc_webrtc_signaling_and_errors():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/webrtc" and request.headers["content-type"] == "application/sdp"
        name = request.url.params["src"]
        if name == "nieznany":
            return httpx.Response(404, text="stream not found")
        if name == "zepsuty":
            return httpx.Response(500, text="dial rtsp://admin:haslo@192.168.1.64:554/s: i/o timeout")
        return httpx.Response(201, text="v=0\r\ns=answer\r\n")

    async def scenario():
        client = go2rtc_client(handler)
        assert (await client.webrtc("cam_a", "v=0\r\n")).startswith("v=0")
        with pytest.raises(Go2rtcError) as missing:
            await client.webrtc("nieznany", "v=0\r\n")
        with pytest.raises(Go2rtcError) as broken:
            await client.webrtc("zepsuty", "v=0\r\n")
        return missing.value, broken.value

    missing, broken = asyncio.run(scenario())
    assert missing.code == "stream_not_registered"
    assert (
        broken.code == "stream_unavailable"
        and "haslo" not in broken.message
        and "admin:" not in broken.message
    )


def test_go2rtc_unavailable_and_unauthorized():
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    async def scenario(handler):
        with pytest.raises(Go2rtcError) as error:
            await go2rtc_client(handler).info()
        return error.value.code

    assert asyncio.run(scenario(refuse)) == "go2rtc_unavailable"
    assert asyncio.run(scenario(lambda request: httpx.Response(401))) == "go2rtc_auth_failed"
    assert redact_url("rtsp://admin:haslo@192.168.1.64:554/s") == "rtsp://192.168.1.64:554/s"


# ---------- ONVIF: wykrywanie ----------


def test_discovery_finds_device_by_unicast_probe(onvif_device):
    devices = asyncio.run(
        discover(multicast=False, hosts=["127.0.0.1"], timeout=0.4, port=onvif_device.discovery_port)
    )
    assert len(devices) == 1
    device = devices[0]
    # Adres pochodzi z nagłówka pakietu, nie z treści komunikatu (która wskazuje obcy host).
    assert device.ip == "127.0.0.1" and device.onvif_port == onvif_device.port
    assert (device.name, device.hardware, device.location) == ("BCS Atrapa", "ATRAPA-NVR", "Garaz")


def test_discovery_returns_nothing_when_no_device_answers():
    assert asyncio.run(discover(multicast=False, hosts=["127.0.0.1"], timeout=0.2, port=1)) == []


def test_probe_match_parsing_ignores_malformed_and_hostile_payloads():
    assert parse_probe_matches(b"to nie jest xml", "10.0.0.5") == []
    assert parse_probe_matches(b"<a><b/></a>", "10.0.0.5") == []
    bomb = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><x>&b;</x>'
    assert parse_probe_matches(bomb, "10.0.0.5") == []


# ---------- ONVIF: odczyt urządzenia (biblioteka onvif-zeep-async) ----------


def inspect(device, username="admin", password="onvif-haslo", port=None):
    return asyncio.run(inspect_device("127.0.0.1", port or device.port, username, password, timeout=10))


def test_onvif_inspect_reads_device_information_and_profiles(onvif_device):
    device = inspect(onvif_device)
    assert (device.manufacturer, device.model, device.firmware, device.serial_number) == (
        "BCS",
        "ATRAPA-NVR",
        "1.2.3",
        "SN0001",
    )
    main, sub = device.profiles
    assert (main.token, main.name, main.encoding, main.resolution, main.fps) == (
        "prof_main",
        "Strumień główny",
        "H264",
        "2560×1440",
        20,
    )
    assert (main.rtsp_port, main.rtsp_path, main.video_source) == (
        onvif_device.rtsp_port,
        "/onvif/main",
        "src_1",
    )
    assert sub.rtsp_path == "/onvif/sub" and sub.resolution == "640×360"
    assert onvif_device.calls.count("GetStreamUri") == 2


@pytest.mark.parametrize(
    ("username", "password"), [("admin", "zle-haslo"), ("ktos", "onvif-haslo"), (None, None)]
)
def test_onvif_inspect_reports_rejected_credentials(onvif_device, username, password):
    with pytest.raises(OnvifError) as error:
        inspect(onvif_device, username, password)
    assert error.value.code == "auth_failed"


def test_onvif_inspect_reports_unreachable_and_non_onvif_endpoints(onvif_device, rtsp_server):
    with pytest.raises(OnvifError) as closed:
        inspect(onvif_device, port=1)
    assert closed.value.code == "connection_refused"
    # Port, na którym działa coś innego niż ONVIF (tu: usługa odpowiadająca błędem HTTP 400).
    rtsp_server.mode = "garbage"
    with pytest.raises(OnvifError) as other:
        inspect(onvif_device, port=rtsp_server.port)
    assert other.value.code == "not_onvif"


def test_onvif_devices_differ_in_supported_features(fake_loop):
    """Urządzenie bez usługi mediów oraz profil, dla którego urządzenie odmawia adresu strumienia."""
    no_media = FakeOnvifDevice(media_service=False)
    partial = FakeOnvifDevice(
        profiles=(
            FakeOnvifProfile("p1", "Główny", "src_1", 1920, 1080, "/main"),
            FakeOnvifProfile("p2", "Bez adresu", "src_1", 640, 360, "/sub", has_uri=False),
        )
    )
    fake_loop.run(no_media.start())
    fake_loop.run(partial.start())
    try:
        with pytest.raises(OnvifError) as error:
            inspect(no_media)
        assert error.value.code == "media_unsupported"

        usable, broken = inspect(partial).profiles
        assert usable.rtsp_path == "/main" and usable.error is None
        assert broken.rtsp_path is None and broken.error
    finally:
        fake_loop.run(no_media.stop())
        fake_loop.run(partial.stop())
