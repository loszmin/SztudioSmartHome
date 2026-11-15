"""Zmiany stanu kamer zgłaszane przez integracje."""

from sqlalchemy.orm import Session

from app import models, schemas
from app.realtime import emit
from app.services.alarms import find_active_alarm, raise_alarm, resolve_alarm
from app.services.events import record_event


def emit_camera(session: Session, camera: models.Camera, type_: str = "camera.updated") -> None:
    emit(session, "cameras", type_, schemas.dump(schemas.CameraOut.from_model(camera)))


def set_camera_status(session: Session, camera: models.Camera, status: str) -> None:
    """Ustawia stan połączenia kamery; przejścia online↔offline tworzą zdarzenia i alarm."""
    previous = camera.status
    camera.status = status
    if status == "online":
        camera.last_seen_at = models.utcnow()
    else:
        camera.signal_quality = None
    if previous == status:
        return

    if status == "offline":
        record_event(
            session,
            category="camera_offline",
            severity="critical",
            title="Utrata połączenia z kamerą",
            source=camera.name,
        )
        if find_active_alarm(session, "camera", camera.id) is None:
            raise_alarm(
                session,
                title="Utrata połączenia z kamerą",
                severity="critical",
                source_type="camera",
                source_name=camera.name,
                source_id=camera.id,
                location=camera.location or None,
            )
    else:
        record_event(session, category="device_online", title="Kamera ponownie online", source=camera.name)
        active = find_active_alarm(session, "camera", camera.id)
        if active is not None:
            resolve_alarm(session, active)
