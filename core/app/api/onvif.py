from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app import models, schemas
from app.api.common import Monitor, Secrets, integration_failure, run_async
from app.auth import AdminPrincipal, DbSession
from app.integrations.bcs.discovery import looks_like_bcs
from app.integrations.errors import IntegrationError
from app.integrations.onvif.client import inspect_device
from app.integrations.onvif.discovery import discover

router = APIRouter(prefix="/onvif", tags=["ONVIF"])


@router.post(
    "/discover",
    response_model=schemas.OnvifDiscoverResponse,
    summary="Wykrywanie urządzeń ONVIF w sieci lokalnej",
)
def discover_devices(
    body: schemas.OnvifDiscoverRequest,
    request: Request,
    _: AdminPrincipal,
    session: DbSession,
    monitor: Monitor,
) -> schemas.OnvifDiscoverResponse:
    """`multicast` działa w domenie rozgłoszeniowej Core; `subnet` odpytuje każdy adres wskazanej podsieci
    (przechodzi przez routing i z kontenera Docker)."""
    hosts: list[str] = []
    if body.mode == "subnet":
        if not body.network:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                {"code": "address_invalid", "message": "Podaj podsieć do przeszukania, np. 192.168.1.0/24."},
            )
        try:
            hosts = monitor.policy.check_network(body.network, monitor.settings.discovery_max_hosts)
        except IntegrationError as error:
            integration_failure(error)

    async def run() -> list:
        return await discover(
            multicast=body.mode == "multicast",
            hosts=hosts,
            timeout=body.timeout_seconds,
            port=request.app.state.ws_discovery_port,
        )

    found = run_async(run)
    known = {camera.ip_address for camera in session.scalars(select(models.Camera)) if camera.ip_address}
    known |= {
        recorder.ip_address for recorder in session.scalars(select(models.Recorder)) if recorder.ip_address
    }
    devices = [
        schemas.OnvifDiscoveredDevice(
            ip=device.ip,
            onvif_port=device.onvif_port,
            name=device.name,
            hardware=device.hardware,
            location=device.location,
            likely_bcs=looks_like_bcs(device),
            already_added=device.ip in known,
        )  # fmt: skip
        for device in found
        # Odpowiedzi spoza dozwolonych sieci są pomijane (multicast może dotrzeć z dowolnego interfejsu).
        if _allowed(monitor, device.ip)
    ]
    return schemas.OnvifDiscoverResponse(mode=body.mode, scanned_hosts=len(hosts), devices=devices)


def _allowed(monitor: Monitor, ip: str) -> bool:
    try:
        monitor.policy.resolve(ip)
        return True
    except IntegrationError:
        return False


@router.post(
    "/inspect", response_model=schemas.OnvifDeviceOut, summary="Dane urządzenia i profile mediów ONVIF"
)
def inspect(
    body: schemas.OnvifInspectRequest,
    _: AdminPrincipal,
    session: DbSession,
    monitor: Monitor,
    secrets: Secrets,
) -> schemas.OnvifDeviceOut:
    """Loguje się do urządzenia i odczytuje producenta, model oraz profile wraz z portem i ścieżką RTSP.

    Host z adresów strumieni zwróconych przez urządzenie jest pomijany – używany jest adres podany w zapytaniu.
    """
    username, password = body.username, body.password
    if not password:
        # Edycja istniejącego urządzenia: puste hasło oznacza „użyj zapisanego”.
        stored = None
        if body.camera_id and (camera := session.get(models.Camera, body.camera_id)):
            stored = camera
            if camera.password_encrypted is None and camera.recorder_id:
                stored = session.get(models.Recorder, camera.recorder_id)
        elif body.recorder_id:
            stored = session.get(models.Recorder, body.recorder_id)
        if stored is not None and stored.password_encrypted:
            try:
                password = secrets.decrypt(stored.password_encrypted)
            except ValueError:
                password = None
            username = username or stored.username
    try:
        ip = monitor.policy.resolve(body.host)
        device = run_async(
            inspect_device, ip, body.port, username, password, monitor.settings.device_timeout_seconds * 4
        )
    except IntegrationError as error:
        integration_failure(error)
    return schemas.OnvifDeviceOut(
        manufacturer=device.manufacturer,
        model=device.model,
        firmware=device.firmware,
        serial_number=device.serial_number,
        profiles=[schemas.OnvifProfileOut(**vars(profile)) for profile in device.profiles],
    )
