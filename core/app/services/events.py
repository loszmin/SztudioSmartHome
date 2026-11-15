from datetime import datetime

from sqlalchemy.orm import Session

from app import models, schemas
from app.realtime import emit


def record_event(
    session: Session,
    *,
    category: str,
    title: str,
    source: str,
    severity: str = "info",
    description: str | None = None,
    occurred_at: datetime | None = None,
) -> models.Event:
    """Zapisuje zdarzenie w historii i kolejkuje komunikat na kanale `events`."""
    event = models.Event(
        id=models.new_id(),
        category=category,
        severity=severity,
        title=title,
        description=description,
        source=source,
        occurred_at=occurred_at or models.utcnow(),
    )
    session.add(event)
    emit(session, "events", "event.created", schemas.dump(schemas.EventOut.model_validate(event)))
    return event
