"""Testy integracyjne zasobów API – kształt odpowiedzi odpowiada typom z `src/types/api.ts`."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app import models

API = "/api/v1"


def create(client, admin, path, body):
    response = client.post(f"{API}{path}", json=body, headers=admin)
    assert response.status_code == 201, response.text
    return response.json()


def test_system_status_contract(client, admin):
    body = client.get(f"{API}/system/status", headers=admin).json()
    assert set(body) == {"core", "resources", "services", "alarmSystem", "serverTime"}
    assert set(body["core"]) == {"state", "version", "hostname", "uptimeSeconds"}
    assert set(body["resources"]) == {"cpuPercent", "memoryPercent", "diskPercent"}
    assert body["core"]["state"] == "online"
    assert body["alarmSystem"]["mode"] == "disarmed"

    services = {service["key"]: service["state"] for service in body["services"]}
    assert services["postgres"] == "running"
    # go2rtc nie jest skonfigurowany, monitor wyłączony, MQTT nie istnieje – nic nie udaje działania.
    assert all(services[key] == "stopped" for key in ("go2rtc", "monitor", "mqtt"))


def test_recorder_crud_never_exposes_password(client, admin):
    recorder = create(
        client, admin, "/recorders",
        {"name": "NVR", "series": "bcs_point", "ipAddress": "127.0.0.20", "port": 80, "channels": 8,
         "username": "admin", "password": "tajne-haslo-nvr"},
    )  # fmt: skip
    assert (
        recorder["hasPassword"] is True and recorder["status"] == "offline" and recorder["lastSeenAt"] is None
    )
    assert "password" not in recorder and "tajne-haslo-nvr" not in str(recorder)

    listing = client.get(f"{API}/recorders", headers=admin)
    assert "tajne-haslo-nvr" not in listing.text and "passwordEncrypted" not in listing.text

    # W bazie hasło jest zaszyfrowane i daje się odszyfrować kluczem aplikacji.
    with client.app.state.session_factory() as session:
        stored = session.scalars(select(models.Recorder)).one().password_encrypted
    assert stored and "tajne-haslo-nvr" not in stored
    assert client.app.state.secret_box.decrypt(stored) == "tajne-haslo-nvr"

    updated = client.patch(
        f"{API}/recorders/{recorder['id']}", json={"password": "", "model": "X"}, headers=admin
    ).json()
    assert updated["hasPassword"] is False and updated["model"] == "X"
    assert client.get(f"{API}/recorders/{recorder['id']}", headers=admin).json()["name"] == "NVR"
    assert client.delete(f"{API}/recorders/{recorder['id']}", headers=admin).status_code == 204
    assert client.get(f"{API}/recorders/{recorder['id']}", headers=admin).status_code == 404


def test_camera_contract_and_hidden_stream_url(client, admin):
    recorder = create(client, admin, "/recorders", {"name": "NVR"})
    camera = create(
        client, admin, "/cameras",
        {"name": "Wejście", "location": "Front", "source": "bcs", "recorderId": recorder["id"], "channel": 1,
         "streamName": "bcs_ch1", "rtspUrl": "rtsp://admin:tajne-haslo-kamery@127.0.0.9:554/ch1", "resolution": "1920×1080"},
    )  # fmt: skip
    assert camera["status"] == "offline" and camera["signalQuality"] is None and camera["lastSeenAt"] is None

    # Lista kamer zachowuje pola, na których opiera się panel, i nie ujawnia źródła.
    listed = client.get(f"{API}/cameras", headers=admin).json()[0]
    assert {
        "id", "name", "location", "status", "signalQuality", "source", "channel",
        "streamName", "resolution", "recording", "lastSeenAt", "enabled", "streamState",
    } <= set(listed)  # fmt: skip
    assert not {"host", "rtspPath", "rtspPort", "username", "password", "hasPassword"} & set(listed)

    # Hasło i adres RTSP nie opuszczają serwera żadnym punktem API.
    for path in ("/cameras", "/devices", "/diagnostics", f"/cameras/{camera['id']}/config"):
        text = client.get(f"{API}{path}", headers=admin).text
        assert "tajne-haslo-kamery" not in text and "rtsp://" not in text, path
    with client.app.state.session_factory() as session:
        stored = session.scalars(select(models.Camera)).one().password_encrypted
    assert stored and "tajne-haslo-kamery" not in stored

    duplicate = client.post(f"{API}/cameras", json={"name": "Inna", "streamName": "bcs_ch1"}, headers=admin)
    assert duplicate.status_code == 409
    missing = client.post(
        f"{API}/cameras", json={"name": "Inna", "streamName": "x", "recorderId": "brak"}, headers=admin
    )
    assert missing.status_code == 422


def test_camera_status_transitions_create_events_and_alarm(client, admin):
    camera = create(client, admin, "/cameras", {"name": "Brama", "streamName": "brama"})
    online = client.patch(
        f"{API}/cameras/{camera['id']}", json={"status": "online", "signalQuality": 80}, headers=admin
    ).json()
    assert online["status"] == "online" and online["signalQuality"] == 80 and online["lastSeenAt"]

    offline = client.patch(f"{API}/cameras/{camera['id']}", json={"status": "offline"}, headers=admin).json()
    assert offline["signalQuality"] is None
    alarms = client.get(f"{API}/alarms", headers=admin).json()
    assert [(a["status"], a["source"]["type"], a["source"]["id"]) for a in alarms] == [
        ("active", "camera", camera["id"])
    ]

    # Powrót kamery zamyka alarm i zapisuje zdarzenie.
    client.patch(f"{API}/cameras/{camera['id']}", json={"status": "online"}, headers=admin)
    assert client.get(f"{API}/alarms", headers=admin).json()[0]["status"] == "resolved"
    categories = [event["category"] for event in client.get(f"{API}/events", headers=admin).json()]
    assert categories.count("camera_offline") == 1 and categories.count("device_online") == 2


def test_devices_view_combines_core_recorders_and_cameras(client, admin):
    create(client, admin, "/recorders", {"name": "NVR", "model": "M", "channels": 4})
    create(client, admin, "/cameras", {"name": "Kamera", "streamName": "k1"})
    devices = client.get(f"{API}/devices", headers=admin).json()
    assert [device["kind"] for device in devices] == ["core", "recorder", "camera"]
    assert devices[1]["channels"] == 4 and devices[1]["lastSeenAt"] is None
    for device in devices:
        assert {"id", "name", "kind", "vendor", "model", "status", "lastSeenAt"} <= set(device)


def test_alarm_acknowledge_flow(client, admin):
    alarm = create(
        client, admin, "/alarms",
        {"title": "Test", "severity": "warning", "source": {"type": "system", "name": "Sztudio Core"}},
    )  # fmt: skip
    assert alarm["status"] == "active" and "acknowledgedAt" not in alarm

    acknowledged = client.post(f"{API}/alarms/{alarm['id']}/acknowledge", headers=admin).json()
    assert acknowledged["status"] == "acknowledged" and acknowledged["acknowledgedBy"] == "admin"
    assert acknowledged["acknowledgedAt"]

    # Ponowne potwierdzenie niczego nie zmienia.
    again = client.post(f"{API}/alarms/{alarm['id']}/acknowledge", headers=admin).json()
    assert again["acknowledgedAt"] == acknowledged["acknowledgedAt"]

    resolved = client.post(f"{API}/alarms/{alarm['id']}/resolve", headers=admin).json()
    assert resolved["status"] == "resolved" and resolved["resolvedAt"]
    assert client.post(f"{API}/alarms/nie-ma/acknowledge", headers=admin).status_code == 404


def test_active_alarms_are_listed_before_history(client, admin):
    source = {"type": "system", "name": "Core"}
    first = create(client, admin, "/alarms", {"title": "stary", "severity": "info", "source": source})
    second = create(client, admin, "/alarms", {"title": "nowy", "severity": "info", "source": source})
    client.post(f"{API}/alarms/{second['id']}/acknowledge", headers=admin)
    assert [alarm["id"] for alarm in client.get(f"{API}/alarms", headers=admin).json()] == [
        first["id"],
        second["id"],
    ]
    assert [alarm["id"] for alarm in client.get(f"{API}/alarms?limit=1", headers=admin).json()] == [
        first["id"]
    ]


def test_arming_mode_change(client, admin):
    response = client.put(f"{API}/alarms/arming", json={"mode": "armed_away"}, headers=admin)
    assert response.status_code == 200
    assert response.json()["mode"] == "armed_away" and response.json()["changedBy"] == "admin"
    assert client.get(f"{API}/system/status", headers=admin).json()["alarmSystem"]["mode"] == "armed_away"
    assert client.get(f"{API}/alarms/arming", headers=admin).json()["mode"] == "armed_away"
    assert client.put(f"{API}/alarms/arming", json={"mode": "zly"}, headers=admin).status_code == 422

    events = client.get(f"{API}/events", headers=admin).json()
    assert events[0]["title"] == "System uzbrojony – pełna ochrona"


def test_sensor_readings_follow_alarm_rules(client, admin):
    motion = create(
        client, admin, "/sensors", {"name": "Ruch – salon", "location": "Salon", "type": "motion"}
    )
    smoke = create(client, admin, "/sensors", {"name": "Dym – kuchnia", "type": "smoke"})
    assert motion["connection"] == "offline" and motion["lastUpdatedAt"] is None and "value" not in motion

    def report(sensor, **reading):
        response = client.post(f"{API}/sensors/{sensor['id']}/reading", json=reading, headers=admin)
        assert response.status_code == 200, response.text
        return response.json()

    def active_alarms():
        return [a for a in client.get(f"{API}/alarms", headers=admin).json() if a["status"] == "active"]

    # System rozbrojony: ruch tworzy zdarzenie, ale nie alarm.
    updated = report(motion, state="triggered", batteryPercent=80)
    assert (
        updated["state"] == "triggered"
        and updated["connection"] == "online"
        and updated["batteryPercent"] == 80
    )
    assert active_alarms() == []
    assert client.get(f"{API}/events?category=motion", headers=admin).json()[0]["source"] == "Ruch – salon"

    # Pełna ochrona: nowe wykrycie ruchu wywołuje alarm krytyczny – tylko jeden na czujnik.
    report(motion, state="idle")
    client.put(f"{API}/alarms/arming", json={"mode": "armed_away"}, headers=admin)
    report(motion, state="triggered")
    report(motion, state="idle")
    report(motion, state="triggered")
    alarms = active_alarms()
    assert len(alarms) == 1 and alarms[0]["severity"] == "critical" and alarms[0]["location"] == "Salon"

    # Dym alarmuje niezależnie od uzbrojenia.
    client.put(f"{API}/alarms/arming", json={"mode": "disarmed"}, headers=admin)
    report(smoke, state="triggered")
    assert {a["source"]["name"] for a in active_alarms()} == {"Ruch – salon", "Dym – kuchnia"}


def test_temperature_sensor_reports_value(client, admin):
    sensor = create(client, admin, "/sensors", {"name": "Temp", "type": "temperature", "unit": "°C"})
    reading = client.post(
        f"{API}/sensors/{sensor['id']}/reading", json={"state": "idle", "value": 21.5}, headers=admin
    ).json()
    assert reading["value"] == 21.5 and reading["unit"] == "°C"
    assert (
        client.post(f"{API}/sensors/{sensor['id']}/reading", json={"state": "zly"}, headers=admin).status_code
        == 422
    )


def test_events_filtering(client, admin):
    now = datetime.now(UTC)
    for age, category in [(0, "motion"), (2, "door"), (26, "motion"), (50, "restart")]:
        create(
            client, admin, "/events",
            {"category": category, "title": f"{category}-{age}", "source": "test",
             "occurredAt": (now - timedelta(hours=age)).isoformat()},
        )  # fmt: skip

    def titles(**params):
        response = client.get(f"{API}/events", params=params, headers=admin)
        assert response.status_code == 200, response.text
        return [event["title"] for event in response.json()]

    assert titles() == ["motion-0", "door-2", "motion-26", "restart-50"]  # od najnowszych
    assert titles(category="motion") == ["motion-0", "motion-26"]
    assert titles(limit=2) == ["motion-0", "door-2"]
    # Parametry `from` / `to` w formacie wysyłanym przez frontend (ISO z „Z”).
    day_ago = (now - timedelta(hours=24)).isoformat().replace("+00:00", "Z")
    assert titles(**{"from": day_ago}) == ["motion-0", "door-2"]
    assert titles(to=day_ago) == ["motion-26", "restart-50"]
    assert titles(category="motion", **{"from": day_ago}) == ["motion-0"]
    assert client.get(f"{API}/events?category=nieznana", headers=admin).status_code == 422
    assert set(client.get(f"{API}/events", headers=admin).json()[0]) == {
        "id",
        "category",
        "severity",
        "title",
        "source",
        "occurredAt",
    }


def test_network_devices(client, admin):
    device = create(
        client, admin, "/network/devices",
        {"name": "Router", "type": "router", "ipAddress": "192.168.1.1", "vendor": "MikroTik"},
    )  # fmt: skip
    assert set(device) == {"id", "name", "type", "ipAddress", "vendor", "status", "lastSeenAt"}
    assert device["status"] == "offline" and device["lastSeenAt"] is None

    online = client.patch(
        f"{API}/network/devices/{device['id']}", json={"status": "online", "latencyMs": 2}, headers=admin
    ).json()
    assert online["latencyMs"] == 2 and online["lastSeenAt"]
    assert client.get(f"{API}/events?category=device_online", headers=admin).json()[0]["source"] == "Router"

    offline = client.patch(
        f"{API}/network/devices/{device['id']}", json={"status": "offline"}, headers=admin
    ).json()
    assert "latencyMs" not in offline
    assert client.delete(f"{API}/network/devices/{device['id']}", headers=admin).status_code == 204
    assert client.get(f"{API}/network/devices", headers=admin).json() == []
