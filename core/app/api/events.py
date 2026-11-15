from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app import models, schemas
from app.api.common import Hub
from app.auth import AdminPrincipal, DbSession
from app.realtime import commit_and_publish
from app.services.events import record_event

router = APIRouter(prefix="/events", tags=["Zdarzenia"])


@router.get("", response_model=list[schemas.EventOut], summary="Historia zdarzeń (od najnowszych)")
def list_events(
    session: DbSession,
    category: schemas.EventCategory | None = None,
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
) -> list[models.Event]:
    query = select(models.Event)
    if category is not None:
        query = query.where(models.Event.category == category)
    if from_ is not None:
        query = query.where(models.Event.occurred_at >= from_)
    if to is not None:
        query = query.where(models.Event.occurred_at <= to)
    return list(session.scalars(query.order_by(models.Event.occurred_at.desc()).limit(limit)))


@router.post(
    "", response_model=schemas.EventOut, status_code=status.HTTP_201_CREATED, summary="Zapis zdarzenia"
)
def create_event(body: schemas.EventCreate, _: AdminPrincipal, session: DbSession, hub: Hub) -> models.Event:
    event = record_event(session, **body.model_dump())
    commit_and_publish(session, hub)
    return event
