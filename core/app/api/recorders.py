from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.common import Hub, Monitor, Secrets, get_or_404, integration_failure, run_async
from app.auth import AdminPrincipal, DbSession
from app.integrations.bcs.adapter import ADAPTERS, REQUIRED_INFORMATION, VENDOR_FEATURES, render_path_template
from app.integrations.bcs.schemas import RecorderChannel, RecorderProbe
from app.integrations.errors import IntegrationError
from app.realtime import commit_and_publish, emit
from app.services.cameras import emit_camera

router = APIRouter(prefix="/recorders", tags=["Rejestratory"])

_PLAIN_FIELDS = (
    "name", "vendor", "series", "model", "firmware", "ip_address", "port",
    "rtsp_port", "onvif_port", "rtsp_path_template", "channels", "username",
)  # fmt: skip
_NULLABLE = {
    "firmware",
    "ip_address",
    "port",
    "rtsp_port",
    "onvif_port",
    "rtsp_path_template",
    "channels",
    "username",
}


def to_out(recorder: models.Recorder) -> schemas.RecorderOut:
    return schemas.RecorderOut(
        **{field: getattr(recorder, field) for field in _PLAIN_FIELDS},
        **schemas.diagnostics_of(recorder),
        id=recorder.id,
        has_password=recorder.password_encrypted is not None,
        status=recorder.status,  # type: ignore[arg-type]
        last_seen_at=recorder.last_seen_at,
        protocols=recorder.protocols,
    )


def notify_recorder(session: Session, type_: str, recorder: models.Recorder) -> None:
    emit(session, "system", type_, schemas.dump(to_out(recorder)))


def _validate(recorder: models.Recorder, monitor: Monitor) -> None:
    try:
        if recorder.ip_address:
            monitor.policy.resolve(recorder.ip_address)
        if recorder.rtsp_path_template:
            render_path_template(recorder.rtsp_path_template, 1, 0)
    except IntegrationError as error:
        integration_failure(error)


@router.get("", response_model=list[schemas.RecorderOut])
def list_recorders(session: DbSession) -> list[schemas.RecorderOut]:
    return [
        to_out(recorder)
        for recorder in session.scalars(select(models.Recorder).order_by(models.Recorder.name))
    ]


@router.get("/integration-info", summary="Stan adapterów i informacje potrzebne do integracji modelu")
def integration_info() -> dict[str, object]:
    return {
        "adapters": [
            {"series": adapter.series, "label": adapter.label, "hardwareVerified": adapter.hardware_verified}
            for adapter in ADAPTERS.values()
        ],
        "requiredInformation": list(REQUIRED_INFORMATION),
        "unsupportedFeatures": list(VENDOR_FEATURES),
    }


@router.post("/test", response_model=RecorderProbe, summary="Test połączenia z rejestratorem przed zapisem")
def test_recorder(
    body: schemas.RecorderTestRequest,
    _: AdminPrincipal,
    session: DbSession,
    monitor: Monitor,
    secrets: Secrets,
) -> RecorderProbe:
    """Weryfikuje protokoły HTTP, RTSP i ONVIF. Niczego nie zapisuje."""
    existing = session.get(models.Recorder, body.recorder_id) if body.recorder_id else None
    scratch = models.Recorder(
        id="", name="", series=body.series, ip_address=body.ip_address, port=body.port,
        rtsp_port=body.rtsp_port, onvif_port=body.onvif_port, username=body.username,
    )  # fmt: skip
    if body.password:
        scratch.password_encrypted = secrets.encrypt(body.password)
    elif existing is not None:
        scratch.password_encrypted = existing.password_encrypted
    _validate(scratch, monitor)
    probe, _device = run_async(monitor.probe_recorder, scratch)
    return probe


@router.get("/{recorder_id}", response_model=schemas.RecorderOut)
def get_recorder(recorder_id: str, session: DbSession) -> schemas.RecorderOut:
    return to_out(get_or_404(session, models.Recorder, recorder_id, "rejestrator"))


@router.post("", response_model=schemas.RecorderOut, status_code=status.HTTP_201_CREATED)
def create_recorder(
    body: schemas.RecorderCreate,
    _: AdminPrincipal,
    session: DbSession,
    hub: Hub,
    monitor: Monitor,
    secrets: Secrets,
) -> schemas.RecorderOut:
    recorder = models.Recorder(
        id=models.new_id(),
        status="offline",
        password_encrypted=secrets.encrypt(body.password) if body.password else None,
        **{field: getattr(body, field) for field in _PLAIN_FIELDS},
    )
    _validate(recorder, monitor)
    session.add(recorder)
    notify_recorder(session, "recorder.created", recorder)
    commit_and_publish(session, hub)
    return to_out(recorder)


@router.patch("/{recorder_id}", response_model=schemas.RecorderOut)
def update_recorder(
    recorder_id: str,
    body: schemas.RecorderUpdate,
    _: AdminPrincipal,
    session: DbSession,
    hub: Hub,
    monitor: Monitor,
    secrets: Secrets,
) -> schemas.RecorderOut:
    recorder = get_or_404(session, models.Recorder, recorder_id, "rejestrator")
    changes = schemas.changes_of(body)
    for field in _PLAIN_FIELDS:
        if field in changes and (changes[field] is not None or field in _NULLABLE):
            setattr(recorder, field, changes[field])
    if changes.get("password") is not None:
        recorder.password_encrypted = secrets.encrypt(changes["password"]) if changes["password"] else None
    if changes.get("status") is not None:
        recorder.status = changes["status"]
        if recorder.status == "online":
            recorder.last_seen_at = models.utcnow()
    _validate(recorder, monitor)
    notify_recorder(session, "recorder.updated", recorder)
    commit_and_publish(session, hub)
    if set(changes) & {"ip_address", "rtsp_port", "username", "password"}:
        # Kamery podłączone przez rejestrator dziedziczą jego adres i dane logowania.
        run_async(monitor.sync_streams)
    return to_out(recorder)


@router.post(
    "/{recorder_id}/check", response_model=RecorderProbe, summary="Weryfikacja protokołów rejestratora teraz"
)
def check_recorder(
    recorder_id: str, _: AdminPrincipal, session: DbSession, monitor: Monitor
) -> RecorderProbe:
    get_or_404(session, models.Recorder, recorder_id, "rejestrator")
    probe = run_async(monitor.check_recorder, recorder_id)
    assert probe is not None
    return probe


def _load_channels(recorder: models.Recorder, session: DbSession, monitor: Monitor) -> list[RecorderChannel]:
    if not recorder.ip_address:
        raise HTTPException(
            status.HTTP_409_CONFLICT, {"code": "not_configured", "message": "Rejestrator nie ma adresu IP."}
        )
    try:
        ip = monitor.policy.resolve(recorder.ip_address)
        channels = run_async(monitor.recorder_adapter(recorder, ip).list_channels)
    except IntegrationError as error:
        integration_failure(error)
    except ValueError as error:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "code": "credentials_unreadable",
                "message": "Nie można odczytać zapisanego hasła – wpisz je ponownie.",
            },
        ) from error
    existing = {
        camera.channel: camera.id
        for camera in session.scalars(select(models.Camera).where(models.Camera.recorder_id == recorder.id))
    }
    for channel in channels:
        channel.camera_id = existing.get(channel.number)
    return channels


@router.get(
    "/{recorder_id}/channels", response_model=list[RecorderChannel], summary="Kanały odczytane z rejestratora"
)
def list_channels(
    recorder_id: str, _: AdminPrincipal, session: DbSession, monitor: Monitor
) -> list[RecorderChannel]:
    """Kanały z ONVIF; gdy ONVIF jest niedostępny – wyliczone z szablonu ścieżki RTSP (oznaczone jako `template`)."""
    return _load_channels(get_or_404(session, models.Recorder, recorder_id, "rejestrator"), session, monitor)


@router.post(
    "/{recorder_id}/channels/import",
    response_model=list[schemas.CameraOut],
    status_code=status.HTTP_201_CREATED,
    summary="Dodanie wybranych kanałów jako kamer",
)
def import_channels(
    recorder_id: str,
    body: schemas.ChannelImportRequest,
    _: AdminPrincipal,
    session: DbSession,
    hub: Hub,
    monitor: Monitor,
) -> list[schemas.CameraOut]:
    recorder = get_or_404(session, models.Recorder, recorder_id, "rejestrator")
    available = {channel.number: channel for channel in _load_channels(recorder, session, monitor)}
    created: list[models.Camera] = []
    for item in body.channels:
        channel = available.get(item.number)
        if channel is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"Rejestrator nie ma kanału {item.number}."
            )
        if channel.camera_id is not None:
            continue  # kanał jest już kamerą w systemie
        usable = [profile for profile in channel.profiles if profile.rtsp_path]
        profile = next((p for p in usable if p.name == item.profile), usable[0] if usable else None)
        if profile is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Kanał {item.number} nie udostępnia adresu strumienia.",
            )
        camera_id = models.new_id()
        camera = models.Camera(
            id=camera_id,
            name=item.name or f"{recorder.name} – kanał {item.number}",
            status="offline",
            source="bcs",
            recorder_id=recorder.id,
            channel=item.number,
            stream_name=f"cam_{camera_id[:8]}",
            # Adres i dane logowania są dziedziczone z rejestratora (pola kamery pozostają puste).
            rtsp_port=profile.rtsp_port,
            rtsp_path=profile.rtsp_path,
            stream_profile=profile.name,
            resolution=profile.resolution,
            fps=profile.fps,
            vendor=recorder.vendor,
            sort_order=item.number,
        )
        session.add(camera)
        session.flush()
        emit_camera(session, camera, "camera.created")
        created.append(camera)
    commit_and_publish(session, hub)
    for camera in created:
        try:
            run_async(monitor.check_camera, camera.id)
        except Exception:  # noqa: BLE001, S110 – stan uzupełni kolejny cykl monitora
            pass
        session.refresh(camera)
    return [schemas.CameraOut.from_model(camera) for camera in created]


@router.delete("/{recorder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recorder(
    recorder_id: str, _: AdminPrincipal, session: DbSession, hub: Hub, monitor: Monitor
) -> Response:
    recorder = get_or_404(session, models.Recorder, recorder_id, "rejestrator")
    notify_recorder(session, "recorder.deleted", recorder)
    session.delete(recorder)
    commit_and_publish(session, hub)
    run_async(monitor.sync_streams)  # kamery tego rejestratora tracą źródło
    return Response(status_code=status.HTTP_204_NO_CONTENT)
