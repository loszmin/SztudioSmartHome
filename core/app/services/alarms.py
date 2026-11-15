"""Logika alarmów: zgłaszanie, potwierdzanie, zamykanie i tryb uzbrojenia."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.realtime import emit
from app.services.events import record_event

ARMING_EVENT_TITLES = {
    "disarmed": "System rozbrojony",
    "armed_home": "System uzbrojony – tryb domowy",
    "armed_away": "System uzbrojony – pełna ochrona",
}


def get_alarm_system(session: Session) -> models.AlarmSystem:
    state = session.get(models.AlarmSystem, 1)
    if state is None:
        state = models.AlarmSystem(id=1, mode="disarmed", changed_at=models.utcnow())
        session.add(state)
        session.flush()
    return state


def _emit_alarm(session: Session, type_: str, alarm: models.Alarm) -> None:
    emit(session, "alarms", type_, schemas.dump(schemas.AlarmOut.from_model(alarm)))


def find_active_alarm(session: Session, source_type: str, source_id: str) -> models.Alarm | None:
    return session.scalars(
        select(models.Alarm).where(
            models.Alarm.status == "active",
            models.Alarm.source_type == source_type,
            models.Alarm.source_id == source_id,
        )
    ).first()


def raise_alarm(
    session: Session,
    *,
    title: str,
    severity: str,
    source_type: str,
    source_name: str,
    source_id: str | None = None,
    description: str | None = None,
    location: str | None = None,
) -> models.Alarm:
    alarm = models.Alarm(
        id=models.new_id(),
        title=title,
        description=description,
        severity=severity,
        status="active",
        source_type=source_type,
        source_name=source_name,
        source_id=source_id,
        location=location,
        triggered_at=models.utcnow(),
    )
    session.add(alarm)
    _emit_alarm(session, "alarm.created", alarm)
    record_event(session, category="alarm", severity=severity, title=f"Alarm: {title}", source=source_name)
    return alarm


def acknowledge_alarm(session: Session, alarm: models.Alarm, username: str) -> models.Alarm:
    """Potwierdza aktywny alarm. Operacja jest idempotentna dla alarmów już potwierdzonych."""
    if alarm.status == "active":
        alarm.status = "acknowledged"
        alarm.acknowledged_at = models.utcnow()
        alarm.acknowledged_by = username
        _emit_alarm(session, "alarm.updated", alarm)
    return alarm


def resolve_alarm(session: Session, alarm: models.Alarm) -> models.Alarm:
    if alarm.status != "resolved":
        alarm.status = "resolved"
        alarm.resolved_at = models.utcnow()
        _emit_alarm(session, "alarm.updated", alarm)
    return alarm


def set_arming_mode(session: Session, mode: str, username: str) -> models.AlarmSystem:
    state = get_alarm_system(session)
    if state.mode != mode:
        state.mode = mode
        state.changed_at = models.utcnow()
        state.changed_by = username
        emit(
            session, "alarms", "arming.changed", schemas.dump(schemas.AlarmSystemState.model_validate(state))
        )
        record_event(session, category="alarm", title=ARMING_EVENT_TITLES[mode], source="Sztudio Core")
    return state
