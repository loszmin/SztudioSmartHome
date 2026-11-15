from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app import models, schemas
from app.api.common import Hub, Secrets, get_or_404
from app.auth import AdminPrincipal, DbSession
from app.realtime import commit_and_publish, discard_pending
from app.services.cameras import emit_camera, set_camera_status

router = APIRouter(prefix="/cameras", tags=["Kamery"])

_PLAIN_FIELDS = (
    "name", "location", "source", "channel", "stream_name", "ip_address",
    "vendor", "model", "resolution", "fps", "recording", "sort_order",
)  # fmt: skip


def _commit(session: DbSession, hub: Hub, camera: models.Camera, event_type: str) -> None:
    """Zapisuje kamerę; naruszenie unikalności nazwy strumienia zamienia na odpowiedź 409."""
    try:
        session.flush()
        emit_camera(session, camera, event_type)
        commit_and_publish(session, hub)
    except IntegrityError as error:
        session.rollback()
        discard_pending(session)
        raise HTTPException(status.HTTP_409_CONFLICT, "Nazwa strumienia jest już używana.") from error


def _check_recorder(session: DbSession, recorder_id: str | None) -> None:
    if recorder_id is not None and session.get(models.Recorder, recorder_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Wskazany rejestrator nie istnieje.")


@router.get("", response_model=list[schemas.CameraOut])
def list_cameras(session: DbSession) -> list[models.Camera]:
    return list(session.scalars(select(models.Camera).order_by(models.Camera.sort_order, models.Camera.name)))


@router.post("", response_model=schemas.CameraOut, status_code=status.HTTP_201_CREATED)
def create_camera(
    body: schemas.CameraCreate, _: AdminPrincipal, session: DbSession, hub: Hub, secrets: Secrets
) -> models.Camera:
    _check_recorder(session, body.recorder_id)
    camera = models.Camera(
        id=models.new_id(),
        status="offline",
        recorder_id=body.recorder_id,
        stream_url_encrypted=secrets.encrypt(body.stream_url) if body.stream_url else None,
        **{field: getattr(body, field) for field in _PLAIN_FIELDS},
    )
    session.add(camera)
    _commit(session, hub, camera, "camera.created")
    return camera


@router.patch("/{camera_id}", response_model=schemas.CameraOut)
def update_camera(
    camera_id: str,
    body: schemas.CameraUpdate,
    _: AdminPrincipal,
    session: DbSession,
    hub: Hub,
    secrets: Secrets,
) -> models.Camera:
    camera = get_or_404(session, models.Camera, camera_id, "kamera")
    changes = body.model_dump(exclude_unset=True)
    if "recorder_id" in changes:
        _check_recorder(session, changes["recorder_id"])
        camera.recorder_id = changes["recorder_id"]
    if "stream_url" in changes:
        camera.stream_url_encrypted = (
            secrets.encrypt(changes["stream_url"]) if changes["stream_url"] else None
        )
    for field in _PLAIN_FIELDS:
        if field in changes:
            setattr(camera, field, changes[field])
    if changes.get("status") is not None:
        set_camera_status(session, camera, changes["status"])
    if "signal_quality" in changes and camera.status == "online":
        camera.signal_quality = changes["signal_quality"]
    _commit(session, hub, camera, "camera.updated")
    return camera


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_camera(camera_id: str, _: AdminPrincipal, session: DbSession, hub: Hub) -> Response:
    camera = get_or_404(session, models.Camera, camera_id, "kamera")
    emit_camera(session, camera, "camera.deleted")
    session.delete(camera)
    commit_and_publish(session, hub)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
