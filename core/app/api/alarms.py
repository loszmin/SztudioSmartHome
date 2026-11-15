from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import case, select

from app import models, schemas
from app.api.common import Hub, get_or_404
from app.auth import AdminPrincipal, DbSession
from app.realtime import commit_and_publish
from app.services import alarms as alarm_service

router = APIRouter(prefix="/alarms", tags=["Alarmy"])


@router.get("", response_model=list[schemas.AlarmOut], summary="Aktywne alarmy i najnowsza historia")
def list_alarms(
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
) -> list[schemas.AlarmOut]:
    # Aktywne alarmy zawsze mieszczą się w limicie – są sortowane przed historią.
    active_first = case((models.Alarm.status == "active", 0), else_=1)
    query = select(models.Alarm).order_by(active_first, models.Alarm.triggered_at.desc()).limit(limit)
    return [schemas.AlarmOut.from_model(alarm) for alarm in session.scalars(query)]


@router.post(
    "", response_model=schemas.AlarmOut, status_code=status.HTTP_201_CREATED, summary="Zgłoszenie alarmu"
)
def create_alarm(
    body: schemas.AlarmCreate, _: AdminPrincipal, session: DbSession, hub: Hub
) -> schemas.AlarmOut:
    alarm = alarm_service.raise_alarm(
        session,
        title=body.title,
        description=body.description,
        severity=body.severity,
        source_type=body.source.type,
        source_name=body.source.name,
        source_id=body.source.id,
        location=body.location,
    )
    commit_and_publish(session, hub)
    return schemas.AlarmOut.from_model(alarm)


@router.get("/arming", response_model=schemas.AlarmSystemState)
def get_arming(session: DbSession) -> models.AlarmSystem:
    state = alarm_service.get_alarm_system(session)
    session.commit()
    return state


@router.put("/arming", response_model=schemas.AlarmSystemState)
def set_arming(
    body: schemas.ArmingRequest, principal: AdminPrincipal, session: DbSession, hub: Hub
) -> models.AlarmSystem:
    state = alarm_service.set_arming_mode(session, body.mode, principal.username)
    commit_and_publish(session, hub)
    return state


@router.post("/{alarm_id}/acknowledge", response_model=schemas.AlarmOut)
def acknowledge(alarm_id: str, principal: AdminPrincipal, session: DbSession, hub: Hub) -> schemas.AlarmOut:
    alarm = get_or_404(session, models.Alarm, alarm_id, "alarm")
    alarm_service.acknowledge_alarm(session, alarm, principal.username)
    commit_and_publish(session, hub)
    return schemas.AlarmOut.from_model(alarm)


@router.post("/{alarm_id}/resolve", response_model=schemas.AlarmOut)
def resolve(alarm_id: str, _: AdminPrincipal, session: DbSession, hub: Hub) -> schemas.AlarmOut:
    alarm = get_or_404(session, models.Alarm, alarm_id, "alarm")
    alarm_service.resolve_alarm(session, alarm)
    commit_and_publish(session, hub)
    return schemas.AlarmOut.from_model(alarm)
