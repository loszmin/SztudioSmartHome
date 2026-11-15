"""Testy integracyjne warstwy sprzętowej: API + PostgreSQL + atrapy urządzeń (RTSP, ONVIF) i go2rtc."""

import logging

from sqlalchemy import select

from app import models

API = "/api/v1"
PASSWORD = "tajne-haslo"


def camera_body(rtsp_server, **overrides):
    body = {
        "name": "Wejście", "location": "Front", "host": "127.0.0.1", "rtspPort": rtsp_server.port,
        "rtspPath": "/stream1", "username": "kamera", "password": PASSWORD, "streamProfile": "main",
    }  # fmt: skip
    body.update(overrides)
    return body


def create_camera(client, admin, rtsp_server, **overrides):
    response = client.post(f"{API}/cameras", json=camera_body(rtsp_server, **overrides), headers=admin)
    assert response.status_code == 201, response.text
    return response.json()


def run_monitor(client, admin):
    response = client.post(f"{API}/diagnostics/run", headers=admin)
    assert response.status_code == 200, response.text
    return response.json()


def get_camera(client, admin, camera_id):
    return next(
        camera for camera in client.get(f"{API}/cameras", headers=admin).json() if camera["id"] == camera_id
    )


# ---------- rejestracja i konfiguracja kamery ----------


def test_registering_camera_checks_connection_and_registers_stream(
    client, admin, viewer, rtsp_server, go2rtc
):
    camera = create_camera(client, admin, rtsp_server)
    # Zapis od razu sprawdza połączenie i rejestruje strumień – bez czekania na cykl monitora.
    assert camera["status"] == "online" and camera["streamState"] == "registered"
    assert camera["lastSuccessAt"] and camera["responseTimeMs"] is not None and camera["signalQuality"] == 100
    assert (camera["host"], camera["rtspPort"], camera["rtspPath"]) == (
        "127.0.0.1",
        rtsp_server.port,
        "/stream1",
    )
    assert camera["username"] == "kamera" and camera["hasPassword"] is True
    assert "password" not in camera and PASSWORD not in str(camera)

    # go2rtc dostał pełny adres źródła – wyłącznie w sieci wewnętrznej.
    assert go2rtc.streams == {
        camera["streamName"]: f"rtsp://kamera:{PASSWORD}@127.0.0.1:{rtsp_server.port}/stream1"
    }

    # Hasło w bazie jest zaszyfrowane.
    with client.app.state.session_factory() as session:
        stored = session.scalars(select(models.Camera)).one().password_encrypted
    assert PASSWORD not in stored and client.app.state.secret_box.decrypt(stored) == PASSWORD

    # Użytkownik bez uprawnień administratora nie widzi konfiguracji źródła.
    listed = client.get(f"{API}/cameras", headers=viewer)
    assert (
        listed.status_code == 200
        and "rtspPath" not in listed.text
        and "kamera" not in listed.json()[0].values()
    )
    assert client.get(f"{API}/cameras/{camera['id']}/config", headers=viewer).status_code == 403
    assert client.get(f"{API}/cameras/{camera['id']}/config", headers=admin).json()["rtspPath"] == "/stream1"


def test_full_rtsp_url_is_split_and_password_encrypted(client, admin, rtsp_server, go2rtc):
    url = f"rtsp://kamera:{PASSWORD}@127.0.0.1:{rtsp_server.port}/cam/realmonitor?channel=1&subtype=0"
    response = client.post(f"{API}/cameras", json={"name": "Z adresu", "rtspUrl": url}, headers=admin)
    camera = response.json()
    assert response.status_code == 201 and camera["status"] == "online"
    assert camera["rtspPath"] == "/cam/realmonitor?channel=1&subtype=0" and camera["username"] == "kamera"
    assert PASSWORD not in response.text


def test_camera_addresses_are_validated_against_ssrf(client, admin, rtsp_server, go2rtc):
    cases = [
        ({"host": "8.8.8.8"}, "address_not_allowed"),  # internet
        ({"host": "169.254.169.254"}, "address_not_allowed"),  # metadane chmury
        ({"host": "127.0.0.200"}, "address_not_allowed"),  # sieć wykluczona (usługi wewnętrzne)
        ({"rtspUrl": "http://127.0.0.1/stream"}, "rtsp_url_invalid"),
        ({"rtspUrl": "exec:ffmpeg -i /etc/passwd -f rtsp {output}"}, "rtsp_url_invalid"),
        ({"rtspPath": "/a\r\nb"}, "rtsp_url_invalid"),
    ]
    for override, code in cases:
        for path in ("/cameras", "/cameras/test"):
            response = client.post(f"{API}{path}", json=camera_body(rtsp_server, **override), headers=admin)
            assert response.status_code == 422 and response.json()["detail"]["code"] == code, (
                override,
                path,
                response.text,
            )
    assert go2rtc.streams == {} and client.get(f"{API}/cameras", headers=admin).json() == []


def test_connection_test_reports_result_without_saving(client, admin, rtsp_server):
    ok = client.post(f"{API}/cameras/test", json=camera_body(rtsp_server), headers=admin).json()
    assert ok["ok"] and ok["code"] == "ok" and ok["tracks"][0] == {"media": "video", "codec": "H264"}

    wrong = client.post(
        f"{API}/cameras/test", json=camera_body(rtsp_server, password="zle"), headers=admin
    ).json()
    assert (wrong["ok"], wrong["code"]) == (False, "auth_failed")
    missing = client.post(
        f"{API}/cameras/test", json=camera_body(rtsp_server, rtspPath="/nie-ma"), headers=admin
    ).json()
    assert missing["code"] == "stream_not_found"
    incomplete = client.post(f"{API}/cameras/test", json={"host": "127.0.0.1"}, headers=admin)
    assert incomplete.status_code == 422 and incomplete.json()["detail"]["code"] == "not_configured"
    assert client.get(f"{API}/cameras", headers=admin).json() == []


def test_connection_test_can_reuse_stored_password_when_editing(client, admin, rtsp_server, go2rtc):
    camera = create_camera(client, admin, rtsp_server)
    # Formularz edycji nie zna hasła – wysyła identyfikator kamery i zmienioną ścieżkę.
    body = {"cameraId": camera["id"], "rtspPath": "/cam/realmonitor?channel=1&subtype=0"}
    assert client.post(f"{API}/cameras/test", json=body, headers=admin).json()["ok"] is True


def test_updating_configuration_replaces_stream_and_keeps_password(client, admin, rtsp_server, go2rtc):
    camera = create_camera(client, admin, rtsp_server)
    path = "/cam/realmonitor?channel=1&subtype=0"
    updated = client.patch(
        f"{API}/cameras/{camera['id']}", json={"rtspPath": path, "name": "Nowa nazwa"}, headers=admin
    ).json()
    assert updated["rtspPath"] == path and updated["name"] == "Nowa nazwa" and updated["status"] == "online"
    assert (
        go2rtc.streams[camera["streamName"]] == f"rtsp://kamera:{PASSWORD}@127.0.0.1:{rtsp_server.port}{path}"
    )

    # Błędna konfiguracja: kamera przechodzi w offline z konkretnym kodem błędu.
    broken = client.patch(
        f"{API}/cameras/{camera['id']}", json={"password": "zle-haslo"}, headers=admin
    ).json()
    assert (broken["status"], broken["errorCode"]) == ("offline", "auth_failed")
    assert "login lub hasło" in broken["errorMessage"]

    fixed = client.patch(f"{API}/cameras/{camera['id']}", json={"password": PASSWORD}, headers=admin).json()
    assert fixed["status"] == "online" and "errorCode" not in fixed


def test_disabling_and_deleting_camera_removes_stream(client, admin, rtsp_server, go2rtc):
    camera = create_camera(client, admin, rtsp_server)
    disabled = client.patch(f"{API}/cameras/{camera['id']}", json={"enabled": False}, headers=admin).json()
    assert disabled["streamState"] == "disabled" and go2rtc.streams == {}

    enabled = client.patch(f"{API}/cameras/{camera['id']}", json={"enabled": True}, headers=admin).json()
    assert enabled["streamState"] == "registered" and camera["streamName"] in go2rtc.streams

    assert client.delete(f"{API}/cameras/{camera['id']}", headers=admin).status_code == 204
    assert go2rtc.streams == {} and client.get(f"{API}/cameras", headers=admin).json() == []


# ---------- monitor: utrata i powrót połączenia ----------


def test_connection_loss_and_recovery(client, admin, rtsp_server, go2rtc, fake_loop):
    camera = create_camera(client, admin, rtsp_server)
    with client.websocket_connect(f"/ws/v1/cameras?token={admin['Authorization'][7:]}") as updates:
        updates.receive_json()

        fake_loop.run(rtsp_server.stop())  # kamera znika z sieci
        run_monitor(client, admin)
        # Pojedyncza nieudana próba nie oznacza jeszcze awarii (próg = 2).
        first = get_camera(client, admin, camera["id"])
        assert first["status"] == "online" and first["errorCode"] == "connection_refused"

        run_monitor(client, admin)
        lost = get_camera(client, admin, camera["id"])
        assert (
            lost["status"] == "offline"
            and lost["signalQuality"] is None
            and lost["lastAttemptAt"] > lost["lastSuccessAt"]
        )
        alarms = client.get(f"{API}/alarms", headers=admin).json()
        assert [(a["status"], a["source"]["id"], a["severity"]) for a in alarms] == [
            ("active", camera["id"], "critical")
        ]

        # Panel dowiaduje się o zmianie bez odpytywania.
        statuses = []
        while "offline" not in statuses:
            statuses.append(updates.receive_json()["data"]["status"])

        fake_loop.run(rtsp_server.start())  # kamera wraca pod tym samym adresem
        run_monitor(client, admin)
        back = get_camera(client, admin, camera["id"])
        assert back["status"] == "online" and "errorCode" not in back and back["streamState"] == "registered"
        assert client.get(f"{API}/alarms", headers=admin).json()[0]["status"] == "resolved"

    categories = [event["category"] for event in client.get(f"{API}/events", headers=admin).json()]
    assert categories.count("camera_offline") == 1 and "device_online" in categories


def test_streams_are_restored_after_go2rtc_restart_or_outage(client, admin, rtsp_server, go2rtc):
    camera = create_camera(client, admin, rtsp_server)
    go2rtc.streams.clear()  # restart go2rtc – strumienie żyją tylko w jego pamięci
    go2rtc.streams["obcy"] = "rtsp://127.0.0.1/stary"  # strumień, którego Core nie zna
    diagnostics = run_monitor(client, admin)
    assert list(go2rtc.streams) == [camera["streamName"]]
    assert diagnostics["go2rtc"]["state"] == "running" and diagnostics["go2rtc"]["streams"] == 1

    go2rtc.available = False
    down = run_monitor(client, admin)
    assert down["go2rtc"]["state"] == "error" and down["go2rtc"]["errorCode"] == "go2rtc_unavailable"
    assert get_camera(client, admin, camera["id"])["streamState"] == "error"
    services = {
        s["key"]: s["state"] for s in client.get(f"{API}/system/status", headers=admin).json()["services"]
    }
    assert services["go2rtc"] == "error"

    go2rtc.available = True
    assert run_monitor(client, admin)["go2rtc"]["state"] == "running"
    assert get_camera(client, admin, camera["id"])["streamState"] == "registered"


# ---------- sygnalizacja WebRTC ----------

OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n"
SDP = {"Content-Type": "application/sdp"}


def test_webrtc_signaling_is_authorized_and_hides_source(client, admin, viewer, rtsp_server, go2rtc):
    camera = create_camera(client, admin, rtsp_server)
    url = f"{API}/cameras/{camera['id']}/webrtc"

    assert client.post(url, content=OFFER, headers=SDP).status_code == 401  # bez tokenu
    for headers in (admin, viewer):  # podgląd jest dostępny także dla roli tylko do odczytu
        response = client.post(url, content=OFFER, headers={**headers, **SDP})
        assert response.status_code == 200 and response.headers["content-type"].startswith("application/sdp")
        assert response.text == f"v=0\r\ns=answer-{camera['streamName']}\r\n"
        assert "rtsp://" not in response.text and PASSWORD not in response.text
    assert go2rtc.offers[0] == (camera["streamName"], OFFER)

    assert client.post(url, content="to nie jest sdp", headers={**admin, **SDP}).status_code == 400
    assert client.post(url, content="v=0" + "x" * 70_000, headers={**admin, **SDP}).status_code == 400
    assert (
        client.post(f"{API}/cameras/brak/webrtc", content=OFFER, headers={**admin, **SDP}).status_code == 404
    )


def test_webrtc_recovers_when_go2rtc_lost_the_stream_and_reports_failures(client, admin, rtsp_server, go2rtc):
    camera = create_camera(client, admin, rtsp_server)
    url = f"{API}/cameras/{camera['id']}/webrtc"
    headers = {**admin, **SDP}

    go2rtc.streams.clear()  # go2rtc zrestartowany między cyklami monitora
    assert client.post(url, content=OFFER, headers=headers).status_code == 200
    assert camera["streamName"] in go2rtc.streams

    go2rtc.available = False
    failed = client.post(url, content=OFFER, headers=headers)
    assert failed.status_code == 502 and failed.json()["detail"]["code"] == "go2rtc_unavailable"
    go2rtc.available = True

    client.patch(f"{API}/cameras/{camera['id']}", json={"enabled": False}, headers=admin)
    disabled = client.post(url, content=OFFER, headers=headers)
    assert disabled.status_code == 409 and disabled.json()["detail"]["code"] == "disabled"


def test_webrtc_without_go2rtc_reports_missing_service(client, admin, rtsp_server):
    camera = create_camera(client, admin, rtsp_server)
    assert camera["streamState"] == "not_configured"
    response = client.post(f"{API}/cameras/{camera['id']}/webrtc", content=OFFER, headers={**admin, **SDP})
    assert response.status_code == 502 and response.json()["detail"]["code"] == "go2rtc_not_configured"


# ---------- ONVIF ----------


def test_onvif_discovery_by_subnet_scan(client, admin, viewer, onvif_device):
    client.app.state.ws_discovery_port = onvif_device.discovery_port
    body = {"mode": "subnet", "network": "127.0.0.0/30", "timeoutSeconds": 1}
    assert client.post(f"{API}/onvif/discover", json=body, headers=viewer).status_code == 403

    found = client.post(f"{API}/onvif/discover", json=body, headers=admin).json()
    assert found["mode"] == "subnet" and found["scannedHosts"] == 2
    assert found["devices"] == [
        {"ip": "127.0.0.1", "onvifPort": onvif_device.port, "name": "BCS Atrapa", "hardware": "ATRAPA-NVR",
         "location": "Garaz", "likelyBcs": True, "alreadyAdded": False}
    ]  # fmt: skip

    client.post(f"{API}/recorders", json={"name": "NVR", "ipAddress": "127.0.0.1"}, headers=admin)
    assert (
        client.post(f"{API}/onvif/discover", json=body, headers=admin).json()["devices"][0]["alreadyAdded"]
        is True
    )


def test_onvif_discovery_validates_scan_range(client, admin):
    cases = [
        ({"mode": "subnet"}, "address_invalid"),
        ({"mode": "subnet", "network": "8.8.8.0/24"}, "address_not_allowed"),
        ({"mode": "subnet", "network": "127.0.0.0/8"}, "network_too_large"),
    ]
    for body, code in cases:
        response = client.post(f"{API}/onvif/discover", json=body, headers=admin)
        assert response.status_code == 422 and response.json()["detail"]["code"] == code
    # Multicast bez urządzeń w zasięgu: pusty wynik, nie błąd.
    empty = client.post(
        f"{API}/onvif/discover", json={"mode": "multicast", "timeoutSeconds": 1}, headers=admin
    )
    assert empty.status_code == 200 and empty.json()["devices"] == []


def test_onvif_inspect_and_adding_discovered_camera(client, admin, onvif_device, rtsp_server, go2rtc):
    body = {"host": "127.0.0.1", "port": onvif_device.port, "username": "admin", "password": "onvif-haslo"}
    device = client.post(f"{API}/onvif/inspect", json=body, headers=admin).json()
    assert (device["manufacturer"], device["model"]) == ("BCS", "ATRAPA-NVR")
    profile = device["profiles"][0]
    assert (profile["rtspPort"], profile["rtspPath"], profile["resolution"]) == (
        rtsp_server.port,
        "/onvif/main",
        "2560×1440",
    )
    # Urządzenie podało w adresie strumienia obcy host – nie trafia on do odpowiedzi ani konfiguracji.
    assert onvif_device.advertised_host not in str(device)

    camera = client.post(
        f"{API}/cameras",
        json={
            "name": "Z wykrywania", "source": "onvif", "host": "127.0.0.1", "onvifPort": onvif_device.port,
            "rtspPort": profile["rtspPort"], "rtspPath": profile["rtspPath"], "streamProfile": profile["name"],
            "username": "kamera", "password": PASSWORD, "resolution": profile["resolution"], "fps": profile["fps"],
            "vendor": device["manufacturer"], "model": device["model"],
        },
        headers=admin,
    ).json()  # fmt: skip
    assert (
        camera["status"] == "online"
        and camera["source"] == "onvif"
        and camera["streamProfile"] == "Strumień główny"
    )
    assert go2rtc.streams[camera["streamName"]].endswith(f"@127.0.0.1:{rtsp_server.port}/onvif/main")


def test_onvif_inspect_errors(client, admin, onvif_device):
    base = {"host": "127.0.0.1", "port": onvif_device.port, "username": "admin"}
    rejected = client.post(f"{API}/onvif/inspect", json={**base, "password": "zle"}, headers=admin)
    assert rejected.status_code == 502 and rejected.json()["detail"]["code"] == "auth_failed"
    closed = client.post(f"{API}/onvif/inspect", json={**base, "port": 1, "password": "x"}, headers=admin)
    assert closed.status_code == 502 and closed.json()["detail"]["code"] == "connection_refused"
    forbidden = client.post(
        f"{API}/onvif/inspect", json={**base, "host": "10.0.0.1", "password": "x"}, headers=admin
    )
    assert forbidden.status_code == 422 and forbidden.json()["detail"]["code"] == "address_not_allowed"


# ---------- rejestratory ----------


def recorder_body(onvif_device, rtsp_server, **overrides):
    body = {
        "name": "Rejestrator", "series": "bcs_point", "ipAddress": "127.0.0.1", "port": 1,
        "rtspPort": rtsp_server.port, "onvifPort": onvif_device.port, "username": "admin", "password": "onvif-haslo",
    }  # fmt: skip
    body.update(overrides)
    return body


def test_recorder_connection_test_verifies_each_protocol(client, admin, onvif_device, rtsp_server):
    rtsp_server.username, rtsp_server.password = "admin", "onvif-haslo"
    body = recorder_body(onvif_device, rtsp_server)
    probe = client.post(
        f"{API}/recorders/test", json={k: v for k, v in body.items() if k != "name"}, headers=admin
    ).json()
    states = {check["protocol"]: check["state"] for check in probe["checks"]}
    assert states == {"http": "closed", "rtsp": "ok", "onvif": "ok"}
    assert probe["reachable"] and probe["code"] == "ok" and probe["device"]["model"] == "ATRAPA-NVR"
    # Adapter nie był sprawdzany z prawdziwym urządzeniem i API to raportuje.
    assert probe["adapter"] == "bcs_point" and probe["hardwareVerified"] is False

    wrong = {**body, "password": "zle"}
    rejected = client.post(
        f"{API}/recorders/test", json={k: v for k, v in wrong.items() if k != "name"}, headers=admin
    ).json()
    assert rejected["code"] == "auth_failed" and rejected["reachable"] is True

    silent = client.post(
        f"{API}/recorders/test",
        json={"ipAddress": "127.0.0.1", "port": 1, "rtspPort": 1, "onvifPort": 1},
        headers=admin,
    ).json()
    assert (silent["reachable"], silent["code"]) == (False, "unreachable")
    outside = client.post(f"{API}/recorders/test", json={"ipAddress": "8.8.8.8"}, headers=admin)
    assert outside.status_code == 422


def test_recorder_channels_are_read_and_imported_as_cameras(client, admin, onvif_device, rtsp_server, go2rtc):
    rtsp_server.username, rtsp_server.password = "admin", "onvif-haslo"
    recorder = client.post(
        f"{API}/recorders", json=recorder_body(onvif_device, rtsp_server), headers=admin
    ).json()

    checked = client.post(f"{API}/recorders/{recorder['id']}/check", headers=admin).json()
    assert checked["reachable"]
    stored = client.get(f"{API}/recorders/{recorder['id']}", headers=admin).json()
    assert stored["status"] == "online" and stored["model"] == "ATRAPA-NVR" and stored["lastSuccessAt"]
    assert {check["protocol"] for check in stored["protocols"]} == {"http", "rtsp", "onvif"}

    channels = client.get(f"{API}/recorders/{recorder['id']}/channels", headers=admin).json()
    assert len(channels) == 1 and channels[0]["origin"] == "onvif" and "cameraId" not in channels[0]
    assert [profile["rtspPath"] for profile in channels[0]["profiles"]] == ["/onvif/main", "/onvif/sub"]

    body = {"channels": [{"number": 1, "name": "Podjazd", "profile": "Strumień pomocniczy"}]}
    imported = client.post(f"{API}/recorders/{recorder['id']}/channels/import", json=body, headers=admin)
    assert imported.status_code == 201, imported.text
    camera = imported.json()[0]
    assert (camera["name"], camera["source"], camera["channel"], camera["status"]) == (
        "Podjazd",
        "bcs",
        1,
        "online",
    )
    # Kamera dziedziczy adres i dane logowania rejestratora.
    assert (
        go2rtc.streams[camera["streamName"]]
        == f"rtsp://admin:onvif-haslo@127.0.0.1:{rtsp_server.port}/onvif/sub"
    )
    config = client.get(f"{API}/cameras/{camera['id']}/config", headers=admin).json()
    assert "host" not in config and config["hasPassword"] is False and config["recorderId"] == recorder["id"]

    assert (
        client.get(f"{API}/recorders/{recorder['id']}/channels", headers=admin).json()[0]["cameraId"]
        == camera["id"]
    )
    again = client.post(f"{API}/recorders/{recorder['id']}/channels/import", json=body, headers=admin)
    assert again.status_code == 201 and again.json() == []  # kanał już dodany
    missing = client.post(
        f"{API}/recorders/{recorder['id']}/channels/import", json={"channels": [{"number": 9}]}, headers=admin
    )
    assert missing.status_code == 422

    # Zmiana hasła rejestratora aktualizuje strumienie jego kamer.
    client.patch(f"{API}/recorders/{recorder['id']}", json={"password": "nowe-haslo"}, headers=admin)
    assert ":nowe-haslo@" in go2rtc.streams[camera["streamName"]]


def test_recorder_channels_fall_back_to_user_template(client, admin, rtsp_server, go2rtc):
    body = {
        "name": "Bez ONVIF", "ipAddress": "127.0.0.1", "port": 1, "onvifPort": 1, "rtspPort": rtsp_server.port,
        "channels": 2, "rtspPathTemplate": "/cam/realmonitor?channel={channel}&subtype={subtype}",
    }  # fmt: skip
    recorder = client.post(f"{API}/recorders", json=body, headers=admin).json()
    channels = client.get(f"{API}/recorders/{recorder['id']}/channels", headers=admin).json()
    assert [channel["origin"] for channel in channels] == ["template", "template"]
    assert channels[1]["profiles"][1]["rtspPath"] == "/cam/realmonitor?channel=2&subtype=1"

    client.patch(f"{API}/recorders/{recorder['id']}", json={"rtspPathTemplate": None}, headers=admin)
    unavailable = client.get(f"{API}/recorders/{recorder['id']}/channels", headers=admin)
    assert unavailable.status_code == 502 and unavailable.json()["detail"]["code"] == "channels_unavailable"

    bad = client.patch(
        f"{API}/recorders/{recorder['id']}", json={"rtspPathTemplate": "/bez-pola-kanalu"}, headers=admin
    )
    assert bad.status_code == 422


def test_integration_info_states_what_is_not_supported(client, admin):
    info = client.get(f"{API}/recorders/integration-info", headers=admin).json()
    assert {adapter["series"] for adapter in info["adapters"]} == {"other", "bcs_point", "bcs_line"}
    assert all(adapter["hardwareVerified"] is False for adapter in info["adapters"])
    assert info["requiredInformation"] and info["unsupportedFeatures"]


# ---------- diagnostyka ----------


def test_diagnostics_lists_every_device_with_connection_details(
    client, admin, viewer, rtsp_server, onvif_device, go2rtc, fake_loop
):
    camera = create_camera(client, admin, rtsp_server, rtspPath="/cam/realmonitor?channel=1&subtype=0")
    client.post(f"{API}/recorders", json=recorder_body(onvif_device, rtsp_server), headers=admin)
    fake_loop.run(rtsp_server.stop())
    run_monitor(client, admin)
    report = run_monitor(client, admin)

    assert set(report) == {"generatedAt", "go2rtc", "monitor", "devices"}
    assert report["monitor"]["enabled"] is False and report["monitor"]["lastRunAt"]
    by_kind = {device["kind"]: device for device in report["devices"]}
    entry = by_kind["camera"]
    assert (
        entry["id"] == camera["id"] and entry["status"] == "offline" and entry["streamState"] == "registered"
    )
    assert (
        entry["errorCode"] == "connection_refused"
        and entry["errorMessage"]
        and entry["lastAttemptAt"]
        and entry["lastSuccessAt"]
    )
    # Adres bez danych logowania i bez parametrów ścieżki.
    assert entry["address"] == f"127.0.0.1:{rtsp_server.port}/cam/realmonitor"
    assert by_kind["recorder"]["name"] == "Rejestrator"

    assert client.get(f"{API}/diagnostics", headers=viewer).status_code == 200
    assert client.post(f"{API}/diagnostics/run", headers=viewer).status_code == 403
    assert client.get(f"{API}/diagnostics").status_code == 401


def test_credentials_never_reach_logs(client, admin, rtsp_server, onvif_device, go2rtc, fake_loop, caplog):
    with caplog.at_level(logging.DEBUG):
        camera = create_camera(client, admin, rtsp_server)
        client.post(
            f"{API}/cameras/test", json=camera_body(rtsp_server, password="inne-tajne-haslo"), headers=admin
        )
        client.post(f"{API}/recorders", json=recorder_body(onvif_device, rtsp_server), headers=admin)
        client.post(
            f"{API}/onvif/inspect",
            json={
                "host": "127.0.0.1",
                "port": onvif_device.port,
                "username": "admin",
                "password": "onvif-haslo",
            },
            headers=admin,
        )
        go2rtc.available = False
        client.patch(f"{API}/cameras/{camera['id']}", json={"rtspPath": "/stream1"}, headers=admin)
        fake_loop.run(rtsp_server.stop())
        run_monitor(client, admin)
    for secret in (PASSWORD, "inne-tajne-haslo", "onvif-haslo"):
        assert secret not in caplog.text
