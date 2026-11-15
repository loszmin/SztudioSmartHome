import socket
import time

import psutil
from fastapi import APIRouter, Request
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app import __version__, models, schemas
from app.auth import DbSession
from app.services.alarms import get_alarm_system

router = APIRouter(prefix="/system", tags=["System"])
public_router = APIRouter(tags=["System"])

#: Integracje sprzętowe, które nie są jeszcze zaimplementowane – raportowane jako zatrzymane.
PLANNED_INTEGRATIONS = [
    ("go2rtc", "go2rtc (integracja nieaktywna)"),
    ("mqtt", "MQTT (integracja nieaktywna)"),
    ("onvif", "ONVIF (integracja nieaktywna)"),
    ("bcs", "BCS (integracja nieaktywna)"),
]


@public_router.get("/health", summary="Kontrola stanu (bez uwierzytelnienia)")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/status", response_model=schemas.SystemStatus)
def system_status(request: Request, session: DbSession) -> schemas.SystemStatus:
    try:
        session.execute(text("SELECT 1"))
        database_ok = True
    except SQLAlchemyError:
        database_ok = False

    alarm_system = get_alarm_system(session)
    session.commit()
    memory = psutil.virtual_memory()
    services = [
        schemas.CoreService(key="postgres", name="PostgreSQL", state="running" if database_ok else "error"),
        schemas.CoreService(key="websocket", name="WebSocket", state="running"),
        *(schemas.CoreService(key=key, name=name, state="stopped") for key, name in PLANNED_INTEGRATIONS),
    ]
    return schemas.SystemStatus(
        core=schemas.CoreInfo(
            state="online" if database_ok else "degraded",
            version=__version__,
            hostname=socket.gethostname(),
            uptime_seconds=int(time.monotonic() - request.app.state.started_monotonic),
        ),
        resources=schemas.Resources(
            cpu_percent=psutil.cpu_percent(interval=None),
            memory_percent=memory.percent,
            disk_percent=psutil.disk_usage("/").percent,
        ),
        services=services,
        alarm_system=schemas.AlarmSystemState.model_validate(alarm_system),
        server_time=models.utcnow(),
    )
