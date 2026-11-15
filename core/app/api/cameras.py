from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app import models, schemas
from app.api.common import Hub, Monitor, Secrets, get_or_404, integration_failure, run_async
from app.auth import AdminPrincipal, DbSession, require_admin
from app.integrations.errors import IntegrationError
from app.integrations.rtsp import normalize_path, parse_rtsp_url, validate_port
from app.monitor import camera_target
from app.realtime import commit_and_publish, discard_pending
from app.services.cameras import emit_camera, set_camera_status

router = APIRouter(prefix="/cameras", tags=["Kamery"])

_PLAIN_FIELDS = (
    "name", "location", "source", "channel", "onvif_port", "stream_profile",
    "vendor", "model", "resolution", "fps", "recording", "enabled", "sort_order",
)  # fmt: skip
_MAX_SDP_BYTES = 64 * 1024


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


def _apply_connection(
    camera: models.Camera, changes: dict[str, Any], monitor: Monitor, secrets: Secrets
) -> None:
    """Przenosi parametry połączenia do modelu po walidacji adresu, portu i ścieżki."""
    try:
        if changes.get("rtsp_url"):
            # Pełny adres jest rozkładany na pola; hasło trafia wyłącznie do zaszyfrowanej kolumny.
            target = parse_rtsp_url(changes["rtsp_url"])
            changes = {
                **changes, "host": target.host, "rtsp_port": target.port, "rtsp_path": target.path,
                **({"username": target.username, "password": target.password or ""} if target.username else {}),
            }  # fmt: skip
        if "host" in changes:
            host = (changes["host"] or "").strip() or None
            if host is not None:
                monitor.policy.resolve(host)
            camera.ip_address = host
        if "rtsp_port" in changes:
            camera.rtsp_port = (
                validate_port(changes["rtsp_port"]) if changes["rtsp_port"] is not None else None
            )
        if "rtsp_path" in changes:
            camera.rtsp_path = normalize_path(changes["rtsp_path"]) if changes["rtsp_path"] else None
    except IntegrationError as error:
        integration_failure(error)
    if "username" in changes:
        camera.username = changes["username"] or None
    if changes.get("password") is not None:
        camera.password_encrypted = secrets.encrypt(changes["password"]) if changes["password"] else None


def _after_change(camera_id: str, monitor: Monitor) -> None:
    """Po zmianie konfiguracji: natychmiastowa kontrola połączenia i rejestracja strumienia w go2rtc."""
    try:
        run_async(monitor.check_camera, camera_id)
    except Exception:  # noqa: BLE001, S110 – konfiguracja jest zapisana; stan uzupełni kolejny cykl monitora
        pass


@router.get("", response_model=list[schemas.CameraOut])
def list_cameras(session: DbSession) -> list[schemas.CameraOut]:
    cameras = session.scalars(select(models.Camera).order_by(models.Camera.sort_order, models.Camera.name))
    return [schemas.CameraOut.from_model(camera) for camera in cameras]


@router.post("/test", response_model=schemas.ProbeOut, summary="Test połączenia RTSP przed zapisem")
def test_connection(
    body: schemas.CameraTestRequest, _: AdminPrincipal, session: DbSession, monitor: Monitor, secrets: Secrets
) -> schemas.ProbeOut:
    """Sprawdza osiągalność, dane logowania i istnienie strumienia. Niczego nie zapisuje."""
    scratch = models.Camera(id="", name="", stream_name="", recorder_id=body.recorder_id)
    existing = session.get(models.Camera, body.camera_id) if body.camera_id else None
    if existing is not None:
        # Edycja: puste hasło w formularzu oznacza „użyj zapisanego”.
        scratch.recorder_id = scratch.recorder_id or existing.recorder_id
        scratch.username, scratch.password_encrypted = existing.username, existing.password_encrypted
        scratch.ip_address, scratch.rtsp_port, scratch.rtsp_path = (
            existing.ip_address,
            existing.rtsp_port,
            existing.rtsp_path,
        )
    _check_recorder(session, scratch.recorder_id)
    _apply_connection(
        scratch, schemas.changes_of(body, exclude={"camera_id", "recorder_id"}), monitor, secrets
    )
    target = camera_target(session, scratch, secrets)
    if target is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            {"code": "not_configured", "message": "Podaj adres urządzenia i ścieżkę strumienia RTSP."},
        )
    result = run_async(monitor.probe_target, target)
    return schemas.ProbeOut(
        ok=result.ok, code=result.code, message=result.message, response_time_ms=result.response_time_ms,
        tracks=[schemas.ProbeTrack(**track) for track in result.tracks], server=result.server,
    )  # fmt: skip


@router.post("", response_model=schemas.CameraConfig, status_code=status.HTTP_201_CREATED)
def create_camera(
    body: schemas.CameraCreate,
    _: AdminPrincipal,
    session: DbSession,
    hub: Hub,
    monitor: Monitor,
    secrets: Secrets,
) -> schemas.CameraConfig:
    _check_recorder(session, body.recorder_id)
    camera_id = models.new_id()
    camera = models.Camera(
        id=camera_id,
        status="offline",
        recorder_id=body.recorder_id,
        stream_name=body.stream_name or f"cam_{camera_id[:8]}",
        **{field: getattr(body, field) for field in _PLAIN_FIELDS},
    )
    _apply_connection(camera, schemas.changes_of(body), monitor, secrets)
    session.add(camera)
    _commit(session, hub, camera, "camera.created")
    _after_change(camera.id, monitor)
    session.refresh(camera)
    return schemas.CameraConfig.from_model(camera)


@router.get("/{camera_id}/config", response_model=schemas.CameraConfig, dependencies=[Depends(require_admin)])
def get_camera_config(camera_id: str, session: DbSession) -> schemas.CameraConfig:
    return schemas.CameraConfig.from_model(get_or_404(session, models.Camera, camera_id, "kamera"))


@router.patch("/{camera_id}", response_model=schemas.CameraConfig)
def update_camera(
    camera_id: str,
    body: schemas.CameraUpdate,
    _: AdminPrincipal,
    session: DbSession,
    hub: Hub,
    monitor: Monitor,
    secrets: Secrets,
) -> schemas.CameraConfig:
    camera = get_or_404(session, models.Camera, camera_id, "kamera")
    changes = schemas.changes_of(body)
    previous_stream = camera.stream_name
    if "recorder_id" in changes:
        _check_recorder(session, changes["recorder_id"])
        camera.recorder_id = changes["recorder_id"]
    if changes.get("stream_name"):
        camera.stream_name = changes["stream_name"]
    for field in _PLAIN_FIELDS:
        if field in changes and (
            changes[field] is not None
            or field in ("channel", "onvif_port", "stream_profile", "resolution", "fps")
        ):
            setattr(camera, field, changes[field])
    _apply_connection(camera, changes, monitor, secrets)
    if changes.get("status") is not None:
        set_camera_status(session, camera, changes["status"])
    if "signal_quality" in changes and camera.status == "online":
        camera.signal_quality = changes["signal_quality"]
    _commit(session, hub, camera, "camera.updated")

    config_changed = bool(
        set(changes) - {"status", "signal_quality", "name", "location", "sort_order", "recording"}
    )
    if previous_stream != camera.stream_name:
        run_async(monitor.remove_stream, previous_stream)
    if config_changed:
        _after_change(camera.id, monitor)
        session.refresh(camera)
    return schemas.CameraConfig.from_model(camera)


@router.post(
    "/{camera_id}/check", response_model=schemas.ProbeOut, summary="Kontrola połączenia z kamerą teraz"
)
def check_camera(camera_id: str, _: AdminPrincipal, session: DbSession, monitor: Monitor) -> schemas.ProbeOut:
    get_or_404(session, models.Camera, camera_id, "kamera")
    result = run_async(monitor.check_camera, camera_id)
    return schemas.ProbeOut(
        ok=result.ok, code=result.code, message=result.message, response_time_ms=result.response_time_ms,
        tracks=[schemas.ProbeTrack(**track) for track in result.tracks], server=result.server,
    )  # fmt: skip


@router.post(
    "/{camera_id}/webrtc",
    summary="Sygnalizacja WebRTC: oferta SDP → odpowiedź SDP",
    response_class=Response,
    responses={200: {"content": {"application/sdp": {}}}},
)
async def webrtc_offer(camera_id: str, request: Request, monitor: Monitor) -> Response:
    """Autoryzowany punkt odtwarzania. Panel nigdy nie łączy się z go2rtc ani nie poznaje adresu RTSP –
    Core przekazuje ofertę do go2rtc w sieci wewnętrznej i zwraca odpowiedź. Obraz płynie następnie
    szyfrowanym połączeniem WebRTC (DTLS-SRTP) zestawionym na podstawie tej wymiany.
    """
    offer = await request.body()
    if not offer or len(offer) > _MAX_SDP_BYTES or not offer.lstrip().startswith(b"v="):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, {"code": "invalid_offer", "message": "Nieprawidłowa oferta SDP."}
        )
    try:
        answer = await monitor.webrtc_answer(camera_id, offer.decode("utf-8", "replace"))
    except IntegrationError as error:
        if error.code == "not_found":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Nie znaleziono: kamera.") from error
        code = (
            status.HTTP_409_CONFLICT
            if error.code in ("disabled", "not_configured")
            else status.HTTP_502_BAD_GATEWAY
        )
        raise HTTPException(code, {"code": error.code, "message": error.message}) from error
    return Response(content=answer, media_type="application/sdp")


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_camera(
    camera_id: str, _: AdminPrincipal, session: DbSession, hub: Hub, monitor: Monitor
) -> Response:
    camera = get_or_404(session, models.Camera, camera_id, "kamera")
    stream_name = camera.stream_name
    emit_camera(session, camera, "camera.deleted")
    session.delete(camera)
    commit_and_publish(session, hub)
    run_async(monitor.remove_stream, stream_name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
