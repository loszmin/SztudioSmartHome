from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app import models, schemas
from app.api.common import Hub, Secrets, get_or_404
from app.auth import AdminPrincipal, DbSession
from app.realtime import commit_and_publish, emit

router = APIRouter(prefix="/recorders", tags=["Rejestratory"])

_PLAIN_FIELDS = (
    "name",
    "vendor",
    "series",
    "model",
    "firmware",
    "ip_address",
    "port",
    "channels",
    "username",
)


def to_out(recorder: models.Recorder) -> schemas.RecorderOut:
    return schemas.RecorderOut(
        **{field: getattr(recorder, field) for field in _PLAIN_FIELDS},
        id=recorder.id,
        has_password=recorder.password_encrypted is not None,
        status=recorder.status,  # type: ignore[arg-type]
        last_seen_at=recorder.last_seen_at,
    )


def _notify(session: DbSession, type_: str, recorder: models.Recorder) -> None:
    emit(session, "system", type_, schemas.dump(to_out(recorder)))


@router.get("", response_model=list[schemas.RecorderOut])
def list_recorders(session: DbSession) -> list[schemas.RecorderOut]:
    return [
        to_out(recorder)
        for recorder in session.scalars(select(models.Recorder).order_by(models.Recorder.name))
    ]


@router.get("/{recorder_id}", response_model=schemas.RecorderOut)
def get_recorder(recorder_id: str, session: DbSession) -> schemas.RecorderOut:
    return to_out(get_or_404(session, models.Recorder, recorder_id, "rejestrator"))


@router.post("", response_model=schemas.RecorderOut, status_code=status.HTTP_201_CREATED)
def create_recorder(
    body: schemas.RecorderCreate, _: AdminPrincipal, session: DbSession, hub: Hub, secrets: Secrets
) -> schemas.RecorderOut:
    recorder = models.Recorder(
        id=models.new_id(),
        status="offline",
        password_encrypted=secrets.encrypt(body.password) if body.password else None,
        **{field: getattr(body, field) for field in _PLAIN_FIELDS},
    )
    session.add(recorder)
    _notify(session, "recorder.created", recorder)
    commit_and_publish(session, hub)
    return to_out(recorder)


@router.patch("/{recorder_id}", response_model=schemas.RecorderOut)
def update_recorder(
    recorder_id: str,
    body: schemas.RecorderUpdate,
    _: AdminPrincipal,
    session: DbSession,
    hub: Hub,
    secrets: Secrets,
) -> schemas.RecorderOut:
    recorder = get_or_404(session, models.Recorder, recorder_id, "rejestrator")
    changes = body.model_dump(exclude_unset=True)
    for field in _PLAIN_FIELDS:
        if field in changes:
            setattr(recorder, field, changes[field])
    if "password" in changes:
        recorder.password_encrypted = secrets.encrypt(changes["password"]) if changes["password"] else None
    if changes.get("status") is not None:
        recorder.status = changes["status"]
        if recorder.status == "online":
            recorder.last_seen_at = models.utcnow()
    _notify(session, "recorder.updated", recorder)
    commit_and_publish(session, hub)
    return to_out(recorder)


@router.delete("/{recorder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recorder(recorder_id: str, _: AdminPrincipal, session: DbSession, hub: Hub) -> Response:
    recorder = get_or_404(session, models.Recorder, recorder_id, "rejestrator")
    _notify(session, "recorder.deleted", recorder)
    session.delete(recorder)
    commit_and_publish(session, hub)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
