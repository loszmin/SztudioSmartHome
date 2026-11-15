"""Przetwarzanie odczytów czujników i reguły wywoływania alarmów."""

from sqlalchemy.orm import Session

from app import models, schemas
from app.realtime import emit
from app.services.alarms import find_active_alarm, get_alarm_system, raise_alarm
from app.services.events import record_event

#: Tytuł alarmu dla każdego typu czujnika.
ALARM_TITLES = {
    "motion": "Ruch w strefie chronionej",
    "contact": "Otwarcie przy uzbrojonym systemie",
    "vibration": "Wibracje – możliwa próba sabotażu",
    "flood": "Wykrycie zalania",
    "smoke": "Wykrycie dymu",
    "temperature": "Temperatura poza zakresem",
}


def alarm_severity_for(sensor_type: str, arming_mode: str) -> str | None:
    """Zwraca poziom alarmu dla aktywnego czujnika albo None, gdy alarm nie powinien powstać.

    - dym i zalanie alarmują zawsze (zagrożenie życia / mienia niezależne od uzbrojenia),
    - temperatura poza zakresem zawsze daje ostrzeżenie,
    - drzwi/okna i wibracje alarmują przy każdym uzbrojeniu,
    - ruch alarmuje tylko przy pełnej ochronie (w trybie domowym domownicy są w środku).
    """
    if sensor_type in ("smoke", "flood"):
        return "critical"
    if sensor_type == "temperature":
        return "warning"
    if sensor_type in ("contact", "vibration"):
        return "critical" if arming_mode in ("armed_home", "armed_away") else None
    if sensor_type == "motion":
        return "critical" if arming_mode == "armed_away" else None
    return None


def apply_reading(session: Session, sensor: models.Sensor, reading: schemas.SensorReading) -> models.Sensor:
    """Zapisuje odczyt czujnika; przy przejściu w stan aktywny tworzy zdarzenie i ewentualny alarm."""
    was_triggered = sensor.state == "triggered"
    sensor.state = reading.state
    if reading.value is not None:
        sensor.value = reading.value
    if reading.battery_percent is not None:
        sensor.battery_percent = reading.battery_percent
    sensor.connection = "online"
    sensor.last_updated_at = models.utcnow()
    emit(session, "alarms", "sensor.updated", schemas.dump(schemas.SensorOut.model_validate(sensor)))

    if reading.state == "triggered" and not was_triggered:
        if sensor.type == "motion":
            record_event(session, category="motion", title="Wykryto ruch", source=sensor.name)
        elif sensor.type == "contact":
            record_event(session, category="door", title="Otwarto drzwi lub okno", source=sensor.name)

        severity = alarm_severity_for(sensor.type, get_alarm_system(session).mode)
        if severity and find_active_alarm(session, "sensor", sensor.id) is None:
            raise_alarm(
                session,
                title=ALARM_TITLES[sensor.type],
                severity=severity,
                source_type="sensor",
                source_name=sensor.name,
                source_id=sensor.id,
                location=sensor.location or None,
            )
    return sensor
