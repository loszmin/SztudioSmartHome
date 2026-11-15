from fastapi import APIRouter
from sqlalchemy import select

from app import models, schemas
from app.api.common import Monitor, run_async
from app.auth import AdminPrincipal, DbSession
from app.integrations.go2rtc import redact_url

router = APIRouter(prefix="/diagnostics", tags=["Diagnostyka"])


def _address(host: str | None, port: int | None, path: str | None = None) -> str | None:
    if not host:
        return None
    # Parametry ścieżki mogą zawierać dane logowania wpisane przez użytkownika – w diagnostyce ich nie pokazujemy.
    shown_path = redact_url((path or "").split("?")[0])
    return f"{host}:{port}{shown_path}" if port else f"{host}{shown_path}"


def build(session: DbSession, monitor: Monitor) -> schemas.DiagnosticsOut:
    devices: list[schemas.DeviceDiagnostics] = []
    recorders = {
        recorder.id: recorder
        for recorder in session.scalars(select(models.Recorder).order_by(models.Recorder.name))
    }
    for recorder in recorders.values():
        devices.append(
            schemas.DeviceDiagnostics(
                **schemas.diagnostics_of(recorder),
                id=recorder.id,
                kind="recorder",
                name=recorder.name,
                address=_address(recorder.ip_address, recorder.port),
                status=recorder.status,  # type: ignore[arg-type]
            )  # fmt: skip
        )
    for camera in session.scalars(
        select(models.Camera).order_by(models.Camera.sort_order, models.Camera.name)
    ):
        recorder = recorders.get(camera.recorder_id or "")
        stream = monitor.go2rtc_streams.get(camera.stream_name)
        devices.append(
            schemas.DeviceDiagnostics(
                **schemas.diagnostics_of(camera),
                id=camera.id,
                kind="camera",
                name=camera.name,
                address=_address(
                    camera.ip_address or (recorder.ip_address if recorder else None),
                    camera.rtsp_port or (recorder.rtsp_port if recorder else None) or 554,
                    camera.rtsp_path,
                ),
                status=camera.status,
                enabled=camera.enabled,
                stream_state=camera.stream_state,  # type: ignore[arg-type]
                stream_consumers=stream.consumers if stream else None,
                stream_connected=stream.connected if stream else None,
            )  # fmt: skip
        )
    return schemas.DiagnosticsOut(
        generated_at=models.utcnow(),
        go2rtc=schemas.Go2rtcStatus(**monitor.go2rtc_health),
        monitor=schemas.MonitorStatus(
            enabled=monitor.settings.monitor_interval_seconds > 0,
            interval_seconds=monitor.settings.monitor_interval_seconds,
            last_run_at=monitor.last_run_at,
            last_duration_ms=monitor.last_duration_ms,
        ),
        devices=devices,
    )


@router.get("", response_model=schemas.DiagnosticsOut, summary="Stan połączeń z urządzeniami i usługą go2rtc")
def get_diagnostics(session: DbSession, monitor: Monitor) -> schemas.DiagnosticsOut:
    return build(session, monitor)


@router.post(
    "/run", response_model=schemas.DiagnosticsOut, summary="Natychmiastowa kontrola wszystkich urządzeń"
)
def run_diagnostics(_: AdminPrincipal, session: DbSession, monitor: Monitor) -> schemas.DiagnosticsOut:
    run_async(monitor.run_once)
    session.expire_all()
    return build(session, monitor)
