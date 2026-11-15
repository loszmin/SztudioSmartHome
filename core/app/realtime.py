"""Rozgłaszanie komunikatów WebSocket do podłączonych paneli."""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any, Literal

import anyio.from_thread
from fastapi import WebSocket
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

Channel = Literal["events", "system", "cameras", "alarms"]
CHANNELS: tuple[Channel, ...] = ("events", "system", "cameras", "alarms")

_OUTBOX_KEY = "realtime_outbox"


class RealtimeHub:
    """Rejestr połączeń w obrębie jednego procesu (Core działa jako pojedynczy worker)."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {channel: set() for channel in CHANNELS}

    def connection_count(self) -> int:
        return sum(len(group) for group in self._connections.values())

    def register(self, channel: Channel, websocket: WebSocket) -> None:
        self._connections[channel].add(websocket)

    def unregister(self, channel: Channel, websocket: WebSocket) -> None:
        self._connections[channel].discard(websocket)

    async def broadcast(self, channel: Channel, message: dict[str, Any]) -> None:
        for websocket in list(self._connections[channel]):
            try:
                await websocket.send_json(message)
            except Exception:  # połączenie zerwane w trakcie wysyłki
                self.unregister(channel, websocket)

    def publish(self, channel: Channel, message: dict[str, Any]) -> None:
        """Wysyła komunikat z kodu synchronicznego (wątek obsługi żądania)."""
        try:
            anyio.from_thread.run(self.broadcast, channel, message)
        except RuntimeError:
            # Wywołanie spoza wątku roboczego (np. CLI) – brak klientów do powiadomienia.
            try:
                asyncio.get_running_loop().create_task(self.broadcast(channel, message))
            except RuntimeError:
                logger.debug("Pominięto komunikat %s – brak pętli zdarzeń", message.get("type"))


def emit(session: Session, channel: Channel, type_: str, data: Any = None) -> None:
    """Kolejkuje komunikat; zostanie wysłany dopiero po zatwierdzeniu transakcji."""
    message = {"type": type_, "data": data, "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z")}
    session.info.setdefault(_OUTBOX_KEY, []).append((channel, message))


def discard_pending(session: Session) -> None:
    """Porzuca zakolejkowane komunikaty (po wycofaniu transakcji)."""
    session.info.pop(_OUTBOX_KEY, None)


def commit_and_publish(session: Session, hub: RealtimeHub) -> None:
    """Zatwierdza transakcję i rozsyła zakolejkowane komunikaty."""
    outbox = session.info.pop(_OUTBOX_KEY, [])
    session.commit()
    for channel, message in outbox:
        hub.publish(channel, message)
