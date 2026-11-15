from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app import models, schemas
from app.api.common import Hub, get_or_404
from app.auth import AdminPrincipal, DbSession
from app.realtime import commit_and_publish, emit
from app.services.events import record_event

router = APIRouter(prefix="/network/devices", tags=["Sieć"])


def _notify(session: DbSession, type_: str, device: models.NetworkDevice) -> None:
    emit(session, "system", type_, schemas.dump(schemas.NetworkDeviceOut.model_validate(device)))


@router.get("", response_model=list[schemas.NetworkDeviceOut])
def list_network_devices(session: DbSession) -> list[models.NetworkDevice]:
    return list(session.scalars(select(models.NetworkDevice).order_by(models.NetworkDevice.ip_address)))


@router.post("", response_model=schemas.NetworkDeviceOut, status_code=status.HTTP_201_CREATED)
def create_network_device(
    body: schemas.NetworkDeviceCreate, _: AdminPrincipal, session: DbSession, hub: Hub
) -> models.NetworkDevice:
    device = models.NetworkDevice(id=models.new_id(), status="offline", **body.model_dump())
    session.add(device)
    _notify(session, "network.created", device)
    commit_and_publish(session, hub)
    return device


@router.patch("/{device_id}", response_model=schemas.NetworkDeviceOut)
def update_network_device(
    device_id: str, body: schemas.NetworkDeviceUpdate, _: AdminPrincipal, session: DbSession, hub: Hub
) -> models.NetworkDevice:
    device = get_or_404(session, models.NetworkDevice, device_id, "urządzenie sieciowe")
    changes = body.model_dump(exclude_unset=True)
    was_online = device.status == "online"
    for field, value in changes.items():
        if value is not None or field in ("mac_address", "latency_ms"):
            setattr(device, field, value)
    if device.status == "online":
        device.last_seen_at = models.utcnow()
        if not was_online and "status" in changes:
            record_event(
                session, category="device_online", title="Urządzenie ponownie online", source=device.name
            )
    else:
        device.latency_ms = None
    _notify(session, "network.updated", device)
    commit_and_publish(session, hub)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_network_device(device_id: str, _: AdminPrincipal, session: DbSession, hub: Hub) -> Response:
    device = get_or_404(session, models.NetworkDevice, device_id, "urządzenie sieciowe")
    _notify(session, "network.deleted", device)
    session.delete(device)
    commit_and_publish(session, hub)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
