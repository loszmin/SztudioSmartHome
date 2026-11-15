from collections.abc import Awaitable, Callable
from typing import Annotated, Any, NoReturn

import anyio.from_thread
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import Base
from app.integrations.errors import IntegrationError
from app.monitor import DeviceMonitor
from app.realtime import RealtimeHub
from app.security import SecretBox

#: Kody błędów wynikające z danych podanych przez użytkownika (pozostałe = problem po stronie urządzenia).
_INPUT_ERROR_CODES = {
    "address_not_allowed",
    "address_invalid",
    "rtsp_url_invalid",
    "network_too_large",
    "dns_error",
}


def get_hub(request: Request) -> RealtimeHub:
    return request.app.state.hub


def get_secret_box(request: Request) -> SecretBox:
    return request.app.state.secret_box


def get_monitor(request: Request) -> DeviceMonitor:
    return request.app.state.monitor


Hub = Annotated[RealtimeHub, Depends(get_hub)]
Secrets = Annotated[SecretBox, Depends(get_secret_box)]
Monitor = Annotated[DeviceMonitor, Depends(get_monitor)]


def get_or_404[T: Base](session: Session, model: type[T], item_id: str, label: str) -> T:
    item = session.get(model, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Nie znaleziono: {label}.")
    return item


def run_async[T](function: Callable[..., Awaitable[T]], *args: Any) -> T:
    """Wywołuje funkcję asynchroniczną z synchronicznego punktu API (wątek roboczy → pętla zdarzeń)."""
    return anyio.from_thread.run(function, *args)


def integration_failure(error: IntegrationError) -> NoReturn:
    """Zamienia błąd integracji na odpowiedź HTTP z kodem diagnostycznym i opisem."""
    code = (
        status.HTTP_422_UNPROCESSABLE_CONTENT
        if error.code in _INPUT_ERROR_CODES
        else status.HTTP_502_BAD_GATEWAY
    )
    raise HTTPException(code, {"code": error.code, "message": error.message}) from error
