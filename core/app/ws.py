"""Kanały WebSocket: /ws/v1/events, /ws/v1/system, /ws/v1/cameras, /ws/v1/alarms."""

from datetime import UTC, datetime
from typing import get_args

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.auth import Principal, authenticate_token
from app.realtime import Channel

router = APIRouter()

#: Kod zamknięcia dla nieuwierzytelnionego połączenia (zakres aplikacyjny 4000–4999).
WS_UNAUTHORIZED = 4401


def _authenticate(websocket: WebSocket, token: str) -> Principal | None:
    with websocket.app.state.session_factory() as session:
        return authenticate_token(session, websocket.app.state.signer, token)


@router.websocket("/ws/v1/{channel}")
async def realtime_channel(websocket: WebSocket, channel: str) -> None:
    """Strumień komunikatów `{type, data, timestamp}`. Token podaje się w parametrze `?token=`."""
    await websocket.accept()
    token = websocket.query_params.get("token", "")
    principal = await run_in_threadpool(_authenticate, websocket, token) if token else None
    if principal is None or channel not in get_args(Channel):
        await websocket.close(code=WS_UNAUTHORIZED if principal is None else 4404)
        return

    hub = websocket.app.state.hub
    hub.register(channel, websocket)  # type: ignore[arg-type]
    try:
        await websocket.send_json(
            {
                "type": "connected",
                "data": {"channel": channel},
                "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            }
        )
        while True:
            # Panel niczego nie wysyła – odbiór służy wykryciu rozłączenia.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.unregister(channel, websocket)  # type: ignore[arg-type]
