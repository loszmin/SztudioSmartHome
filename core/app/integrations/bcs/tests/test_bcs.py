"""Testy modułu BCS na atrapach protokołów standardowych.

Nie potwierdzają współpracy z żadnym rzeczywistym rejestratorem BCS.
"""

import asyncio

import httpx
import pytest

from app.integrations.bcs.adapter import (
    ADAPTERS,
    REQUIRED_INFORMATION,
    BcsLineAdapter,
    BcsPointAdapter,
    RecorderAdapter,
    adapter_for,
    render_path_template,
)
from app.integrations.bcs.client import BcsProtocolClient
from app.integrations.bcs.discovery import looks_like_bcs
from app.integrations.bcs.exceptions import BcsError, BcsNotImplementedError
from app.integrations.onvif.discovery import DiscoveredDevice
from app.integrations.rtsp import RtspUrlError
from tests.fakes import FakeOnvifDevice, FakeOnvifProfile


def http_ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, headers={"Server": "AtrapaHTTP"}, text="<html></html>")


def make_client(onvif_device, rtsp_server, **overrides) -> BcsProtocolClient:
    rtsp_server.username, rtsp_server.password = "admin", "onvif-haslo"
    values = {
        "ip": "127.0.0.1", "http_port": 80, "rtsp_port": rtsp_server.port, "onvif_port": onvif_device.port,
        "username": "admin", "password": "onvif-haslo", "timeout": 1.0, "transport": httpx.MockTransport(http_ok),
    }  # fmt: skip
    values.update(overrides)
    return BcsProtocolClient(**values)


def test_adapter_registry_and_honest_status():
    assert adapter_for("bcs_point") is BcsPointAdapter and adapter_for("bcs_line") is BcsLineAdapter
    assert adapter_for("nieznana") is RecorderAdapter
    # Żaden adapter nie jest oznaczony jako sprawdzony ze sprzętem.
    assert not any(adapter.hardware_verified for adapter in ADAPTERS.values())
    assert len(REQUIRED_INFORMATION) >= 5


def test_probe_verifies_protocols(onvif_device, rtsp_server):
    probe, device = asyncio.run(BcsPointAdapter(make_client(onvif_device, rtsp_server)).probe())
    assert {check.protocol: check.state for check in probe.checks} == {
        "http": "ok",
        "rtsp": "ok",
        "onvif": "ok",
    }
    assert (
        probe.reachable
        and probe.code == "ok"
        and probe.adapter == "bcs_point"
        and not probe.hardware_verified
    )
    assert probe.device.manufacturer == "BCS" and device is not None
    assert probe.checks[0].server == "AtrapaHTTP" and probe.checks[1].server == "AtrapaRTSP/1.0"


def test_probe_distinguishes_bad_credentials_from_unreachable_device(onvif_device, rtsp_server):
    rejected, _ = asyncio.run(RecorderAdapter(make_client(onvif_device, rtsp_server, password="zle")).probe())
    assert rejected.reachable and rejected.code == "auth_failed"
    assert {check.protocol: check.state for check in rejected.checks} == {
        "http": "ok",
        "rtsp": "auth_failed",
        "onvif": "auth_failed",
    }

    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    silent = make_client(
        onvif_device, rtsp_server, rtsp_port=1, onvif_port=1, transport=httpx.MockTransport(refuse)
    )
    probe, device = asyncio.run(RecorderAdapter(silent).probe())
    assert not probe.reachable and probe.code == "unreachable" and device is None
    assert all(check.state == "closed" for check in probe.checks)


def test_light_probe_skips_onvif(onvif_device, rtsp_server):
    probe, _ = asyncio.run(RecorderAdapter(make_client(onvif_device, rtsp_server)).probe(deep=False))
    assert [check.protocol for check in probe.checks] == ["http", "rtsp"]
    assert "GetProfiles" not in onvif_device.calls


def test_channels_are_grouped_by_video_source(rtsp_server, fake_loop):
    recorder = FakeOnvifDevice(
        profiles=(
            FakeOnvifProfile("c1m", "Kanał 1 główny", "src_1", 1920, 1080, "/ch1/main"),
            FakeOnvifProfile("c1s", "Kanał 1 pomocniczy", "src_1", 640, 360, "/ch1/sub"),
            FakeOnvifProfile("c2m", "Kanał 2 główny", "src_2", 1920, 1080, "/ch2/main"),
        ),
        rtsp_port=rtsp_server.port,
    )
    fake_loop.run(recorder.start())
    try:
        channels = asyncio.run(RecorderAdapter(make_client(recorder, rtsp_server)).list_channels())
    finally:
        fake_loop.run(recorder.stop())
    assert [(channel.number, channel.origin, len(channel.profiles)) for channel in channels] == [
        (1, "onvif", 2),
        (2, "onvif", 1),
    ]
    assert (
        channels[1].profiles[0].rtsp_path == "/ch2/main" and channels[0].profiles[1].resolution == "640×360"
    )


def test_channels_fall_back_to_template_or_fail_clearly(onvif_device, rtsp_server):
    client = make_client(onvif_device, rtsp_server, onvif_port=1)
    template = "/cam/realmonitor?channel={channel}&subtype={subtype}"
    channels = asyncio.run(
        RecorderAdapter(client, rtsp_path_template=template, channel_count=4).list_channels()
    )
    assert len(channels) == 4 and all(channel.origin == "template" for channel in channels)
    assert channels[2].profiles[0].rtsp_path == "/cam/realmonitor?channel=3&subtype=0"

    with pytest.raises(BcsError) as error:
        asyncio.run(RecorderAdapter(client).list_channels())
    assert error.value.code == "channels_unavailable"


def test_path_template_validation():
    assert render_path_template("ch{channel}/{subtype}", 5, 1) == "/ch5/1"
    for template in ("/stream", "/ch{channel} x", "rtsp://host/{channel}"):
        with pytest.raises(RtspUrlError):
            render_path_template(template, 1, 0)


def test_vendor_features_are_not_faked(onvif_device, rtsp_server):
    adapter = BcsLineAdapter(make_client(onvif_device, rtsp_server))
    with pytest.raises(BcsNotImplementedError) as error:
        asyncio.run(adapter.vendor_feature("Odtwarzanie nagrań"))
    assert error.value.code == "vendor_api_not_implemented"


def test_bcs_detection_uses_only_advertised_names():
    assert looks_like_bcs(DiscoveredDevice(ip="10.0.0.5", name="BCS-P-NVR0801", hardware=None))
    assert looks_like_bcs(DiscoveredDevice(ip="10.0.0.5", name="NVR", hardware="bcs-l-nvr1602"))
    assert not looks_like_bcs(DiscoveredDevice(ip="10.0.0.5", name="Kamera IP", hardware="IPC-1234"))
