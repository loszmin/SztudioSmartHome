"""Dane demonstracyjne dla środowiska deweloperskiego.

Ładowane wyłącznie poleceniem `python -m app.cli seed-demo`, które odmawia pracy
w trybie produkcyjnym. Nie pochodzą z żadnych rzeczywistych urządzeń.
"""

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models

MIN = timedelta(minutes=1)
HOUR = timedelta(hours=1)
DAY = timedelta(days=1)


def database_is_empty(session: Session) -> bool:
    tables = (models.Camera, models.Recorder, models.Sensor, models.Alarm, models.Event, models.NetworkDevice)
    return all(session.scalar(select(func.count()).select_from(table)) == 0 for table in tables)


def seed_demo(session: Session) -> None:
    now = models.utcnow()

    recorder = models.Recorder(
        id=models.new_id(), name="Rejestrator BCS", vendor="BCS", series="other",
        model="Rejestrator NVR 8-kanałowy (demo)", ip_address="192.168.1.20", port=80, channels=8,
        status="online", last_seen_at=now,
    )  # fmt: skip
    session.add(recorder)
    session.flush()  # kamery wskazują rejestrator kluczem obcym

    camera_rows = [
        ("Wejście główne", "Front domu", 96, "2560×1440", True),
        ("Podjazd", "Front domu", 91, "2560×1440", True),
        ("Ogród", "Tył domu", 84, "1920×1080", True),
        ("Garaż", "Garaż", 78, "1920×1080", True),
        ("Taras", "Tył domu", 88, "2560×1440", True),
        ("Furtka", "Ogrodzenie", 47, "1920×1080", False),
        ("Brama wjazdowa", "Ogrodzenie", None, "1920×1080", False),
        ("Kotłownia", "Piwnica", 93, "1920×1080", True),
    ]
    cameras = []
    for index, (name, location, quality, resolution, recording) in enumerate(camera_rows, start=1):
        online = quality is not None
        camera = models.Camera(
            id=models.new_id(), name=name, location=location, status="online" if online else "offline",
            signal_quality=quality, source="bcs", recorder_id=recorder.id, channel=index,
            stream_name=f"bcs_ch{index}", ip_address=f"192.168.1.{100 + index}", vendor="BCS", model="demo",
            resolution=resolution, fps=20, recording=recording, sort_order=index,
            last_seen_at=now if online else now - 47 * MIN,
        )  # fmt: skip
        cameras.append(camera)
    session.add_all(cameras)

    sensor_rows = [
        ("Ruch – salon", "Salon", "motion", "idle", 4 * MIN, 87, None),
        ("Ruch – korytarz", "Korytarz", "motion", "idle", 22 * MIN, 64, None),
        ("Ruch – garaż", "Garaż", "motion", "triggered", MIN, 71, None),
        ("Drzwi wejściowe", "Wiatrołap", "contact", "idle", 38 * MIN, 92, None),
        ("Drzwi tarasowe", "Salon", "contact", "idle", 3 * HOUR, 80, None),
        ("Okno – kuchnia", "Kuchnia", "contact", "triggered", 12 * MIN, 58, None),
        ("Brama garażowa", "Garaż", "contact", "idle", 9 * HOUR, 76, None),
        ("Zalanie – łazienka", "Łazienka", "flood", "idle", 2 * MIN, 95, None),
        ("Zalanie – kotłownia", "Piwnica", "flood", "idle", 6 * MIN, 18, None),
        ("Dym – kuchnia", "Kuchnia", "smoke", "idle", MIN, 83, None),
        ("Dym – poddasze", "Poddasze", "smoke", "idle", 3 * MIN, 79, None),
        ("Temperatura – salon", "Salon", "temperature", "idle", MIN, 90, 21.6),
        ("Temperatura – kotłownia", "Piwnica", "temperature", "idle", 2 * MIN, 66, 17.2),
        ("Temperatura – serwerownia", "Szafa RACK", "temperature", "triggered", MIN, None, 34.8),
        ("Wibracje – okno salon", "Salon", "vibration", "idle", 5 * HOUR, 74, None),
    ]
    sensors = {}
    for name, location, type_, state, age, battery, value in sensor_rows:
        sensors[name] = models.Sensor(
            id=models.new_id(), name=name, location=location, type=type_, state=state, value=value,
            unit="°C" if type_ == "temperature" else None, connection="online",
            battery_percent=battery, last_updated_at=now - age,
        )  # fmt: skip
    sensors["Wibracje – drzwi garaż"] = models.Sensor(
        id=models.new_id(), name="Wibracje – drzwi garaż", location="Garaż", type="vibration",
        state="idle", connection="offline", last_updated_at=now - 2 * DAY,
    )  # fmt: skip
    session.add_all(sensors.values())

    offline_camera = cameras[6]
    hot = sensors["Temperatura – serwerownia"]
    low_battery = sensors["Zalanie – kotłownia"]
    session.add_all(
        [
            models.Alarm(
                id=models.new_id(), title="Utrata połączenia z kamerą", severity="critical", status="active",
                description="Kamera „Brama wjazdowa” nie odpowiada od 47 minut.", source_type="camera",
                source_name=offline_camera.name, source_id=offline_camera.id, location="Ogrodzenie",
                triggered_at=now - 47 * MIN,
            ),
            models.Alarm(
                id=models.new_id(), title="Wysoka temperatura", severity="warning", status="active",
                description="Temperatura w szafie RACK przekroczyła próg 32 °C.", source_type="sensor",
                source_name=hot.name, source_id=hot.id, location="Szafa RACK", triggered_at=now - 18 * MIN,
            ),
            models.Alarm(
                id=models.new_id(), title="Niski poziom baterii czujnika", severity="info", status="active",
                description="Czujnik „Zalanie – kotłownia” zgłasza 18% baterii.", source_type="sensor",
                source_name=low_battery.name, source_id=low_battery.id, location="Piwnica",
                triggered_at=now - 3 * HOUR,
            ),
            models.Alarm(
                id=models.new_id(), title="Ruch w strefie chronionej", severity="critical", status="resolved",
                source_type="sensor", source_name="Ruch – garaż", location="Garaż", triggered_at=now - 9 * HOUR,
                acknowledged_at=now - 9 * HOUR + 4 * MIN, acknowledged_by="admin",
                resolved_at=now - 9 * HOUR + 20 * MIN,
            ),
            models.Alarm(
                id=models.new_id(), title="Utrata połączenia z rejestratorem", severity="critical",
                status="resolved", source_type="network", source_name="Rejestrator BCS", location="Szafa RACK",
                triggered_at=now - 2 * DAY, acknowledged_at=now - 2 * DAY + 4 * MIN, acknowledged_by="admin",
                resolved_at=now - 2 * DAY + 9 * MIN,
            ),
        ]
    )  # fmt: skip

    event_rows = [
        (MIN, "motion", "info", "Wykryto ruch", "Ruch – garaż", None),
        (4 * MIN, "motion", "info", "Wykryto ruch", "Kamera Podjazd", "Detekcja ruchu w strefie 1."),
        (12 * MIN, "door", "warning", "Otwarto okno", "Okno – kuchnia", None),
        (18 * MIN, "alarm", "warning", "Alarm: wysoka temperatura", "Temperatura – serwerownia", None),
        (38 * MIN, "door", "info", "Otwarto drzwi", "Drzwi wejściowe", None),
        (47 * MIN, "camera_offline", "critical", "Utrata połączenia z kamerą", "Brama wjazdowa", None),
        (3 * HOUR, "device_online", "info", "Urządzenie ponownie online", "Switch PoE", None),
        (3 * HOUR + 2 * MIN, "restart", "info", "Restart urządzenia", "Switch PoE", None),
        (9 * HOUR, "alarm", "critical", "Alarm: ruch w strefie chronionej", "Ruch – garaż", None),
        (DAY + HOUR, "device_online", "info", "Kamera ponownie online", "Furtka", None),
        (DAY + 7 * HOUR, "door", "info", "Otwarto drzwi tarasowe", "Drzwi tarasowe", None),
        (2 * DAY, "alarm", "critical", "Alarm: rejestrator niedostępny", "Rejestrator BCS", None),
        (2 * DAY + 5 * HOUR, "restart", "info", "Restart urządzenia", "Router", None),
        (4 * DAY, "restart", "info", "Restart Sztudio Core", "Sztudio Core", None),
    ]
    session.add_all(
        models.Event(
            id=models.new_id(), category=category, severity=severity, title=title, source=source,
            description=description, occurred_at=now - age,
        )
        for age, category, severity, title, source, description in event_rows
    )  # fmt: skip

    network_rows = [
        ("Sztudio Core", "core", 10, "Sztudio", 1),
        ("Rejestrator BCS", "recorder", 20, "BCS", 2),
        ("Router główny", "router", 1, "MikroTik", 1),
        ("Switch PoE", "switch", 2, "TP-Link", 1),
        ("Punkt dostępowy Wi-Fi", "other", 5, "Ubiquiti", 3),
        ("Zasilacz UPS", "other", 40, "APC", None),
    ]
    devices = [
        models.NetworkDevice(
            id=models.new_id(), name=name, type=type_, ip_address=f"192.168.1.{host}", vendor=vendor,
            status="online" if latency is not None else "offline", latency_ms=latency,
            last_seen_at=now if latency is not None else now - 6 * HOUR,
        )
        for name, type_, host, vendor, latency in network_rows
    ]  # fmt: skip
    devices += [
        models.NetworkDevice(
            id=models.new_id(), name=f"Kamera – {camera.name}", type="camera", ip_address=camera.ip_address or "",
            vendor="BCS", status=camera.status, latency_ms=3 if camera.status == "online" else None,
            last_seen_at=camera.last_seen_at,
        )
        for camera in cameras
    ]  # fmt: skip
    session.add_all(devices)

    state = session.get(models.AlarmSystem, 1) or models.AlarmSystem(id=1)
    state.mode, state.changed_at, state.changed_by = "armed_home", now - 9 * HOUR, "admin"
    session.add(state)
