import socket

from fastapi import APIRouter
from sqlalchemy import select

from app import __version__, models, schemas
from app.auth import DbSession

router = APIRouter(prefix="/devices", tags=["Urządzenia"])


@router.get("", response_model=list[schemas.DeviceOut], summary="Zbiorcza lista urządzeń systemu")
def list_devices(session: DbSession) -> list[schemas.DeviceOut]:
    """Widok łączący Sztudio Core, rejestratory i kamery (tylko do odczytu)."""
    devices = [
        schemas.DeviceOut(
            id="core",
            name="Sztudio Core",
            kind="core",
            vendor="Sztudio",
            model=socket.gethostname(),
            firmware=__version__,
            status="online",
            last_seen_at=models.utcnow(),
        )
    ]
    for recorder in session.scalars(select(models.Recorder).order_by(models.Recorder.name)):
        devices.append(
            schemas.DeviceOut(
                id=recorder.id,
                name=recorder.name,
                kind="recorder",
                vendor=recorder.vendor,
                model=recorder.model,
                firmware=recorder.firmware,
                ip_address=recorder.ip_address,
                channels=recorder.channels,
                status=recorder.status,  # type: ignore[arg-type]
                last_seen_at=recorder.last_seen_at,
            )
        )
    for camera in session.scalars(
        select(models.Camera).order_by(models.Camera.sort_order, models.Camera.name)
    ):
        devices.append(
            schemas.DeviceOut(
                id=camera.id,
                name=camera.name,
                kind="camera",
                vendor=camera.vendor,
                model=camera.model,
                ip_address=camera.ip_address,
                status=camera.status,  # type: ignore[arg-type]
                last_seen_at=camera.last_seen_at,
            )
        )
    return devices
