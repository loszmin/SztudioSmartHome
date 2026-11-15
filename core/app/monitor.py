"""Monitor urządzeń: cykliczna kontrola kamer i rejestratorów oraz synchronizacja strumieni z go2rtc.

Core jest źródłem prawdy o konfiguracji. go2rtc trzyma strumienie wyłącznie w pamięci, więc po jego
restarcie monitor rejestruje je ponownie – bez ręcznej edycji plików i bez haseł na dysku.
"""

import asyncio
import hashlib
import logging
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from anyio import to_thread
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app import models
from app.config import Settings
from app.integrations.bcs.adapter import adapter_for
from app.integrations.bcs.client import DEFAULT_HTTP_PORT, DEFAULT_ONVIF_PORT, BcsProtocolClient
from app.integrations.bcs.schemas import RecorderProbe
from app.integrations.errors import IntegrationError
from app.integrations.go2rtc import Go2rtcClient, Go2rtcError, Go2rtcStream
from app.integrations.netguard import AddressPolicy
from app.integrations.onvif.client import OnvifDevice
from app.integrations.rtsp import (
    DEFAULT_RTSP_PORT,
    ProbeResult,
    RtspTarget,
    probe_rtsp,
    quality_from_response_time,
)
from app.realtime import RealtimeHub, commit_and_publish
from app.security import SecretBox
from app.services.cameras import emit_camera, set_camera_status

logger = logging.getLogger("sztudio.monitor")

_CONCURRENCY = 8


@dataclass
class CameraSnapshot:
    """Dane kamery potrzebne poza transakcją. Zawiera odszyfrowane hasło – nie logować."""

    id: str
    name: str
    stream_name: str
    enabled: bool
    target: RtspTarget | None


def camera_target(session: Session, camera: models.Camera, box: SecretBox) -> RtspTarget | None:
    """Adres źródłowy kamery. Kamera podłączona przez rejestrator dziedziczy jego adres i dane logowania."""
    recorder = session.get(models.Recorder, camera.recorder_id) if camera.recorder_id else None
    host = camera.ip_address or (recorder.ip_address if recorder else None)
    if not host or not camera.rtsp_path:
        return None
    if camera.username or camera.password_encrypted:
        username, encrypted = camera.username, camera.password_encrypted
    elif recorder is not None:
        username, encrypted = recorder.username, recorder.password_encrypted
    else:
        username, encrypted = None, None
    return RtspTarget(
        host=host,
        port=camera.rtsp_port or (recorder.rtsp_port if recorder else None) or DEFAULT_RTSP_PORT,
        path=camera.rtsp_path,
        username=username,
        password=box.decrypt(encrypted) if encrypted else None,
    )


class DeviceMonitor:
    def __init__(
        self,
        *,
        settings: Settings,
        session_factory: sessionmaker[Session],
        hub: RealtimeHub,
        box: SecretBox,
        policy: AddressPolicy,
        go2rtc: Go2rtcClient | None,
    ) -> None:
        self.settings = settings
        self.session_factory = session_factory
        self.hub = hub
        self.box = box
        self.policy = policy
        self.go2rtc: Any = go2rtc
        self.go2rtc_health: dict[str, Any] = {"state": "not_configured" if go2rtc is None else "error"}
        self.go2rtc_streams: dict[str, Go2rtcStream] = {}
        self.last_run_at: datetime | None = None
        self.last_duration_ms: int | None = None
        #: Skróty adresów ostatnio przekazanych go2rtc – pozwalają nie nadpisywać niezmienionych strumieni.
        self._registered: dict[str, str] = {}
        self._task: asyncio.Task[None] | None = None
        self._cycle_lock = asyncio.Lock()

    # ---------- cykl ----------

    def start(self) -> None:
        if self.settings.monitor_interval_seconds > 0 and self._task is None:
            self._task = asyncio.create_task(self._loop(), name="device-monitor")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self.go2rtc is not None:
            await self.go2rtc.close()

    async def _loop(self) -> None:
        while True:
            try:
                await self.run_once()
            except Exception:  # noqa: BLE001 – monitor nie może się zatrzymać przez pojedynczy błąd
                logger.exception("Cykl monitora zakończony błędem")
            await asyncio.sleep(self.settings.monitor_interval_seconds)

    async def run_once(self) -> None:
        """Jeden pełny cykl: stan go2rtc, kontrola urządzeń, synchronizacja strumieni."""
        async with self._cycle_lock:
            started = time.monotonic()
            await self.refresh_go2rtc()
            cameras, recorder_ids = await to_thread.run_sync(self._load)
            limiter = asyncio.Semaphore(_CONCURRENCY)

            async def limited(coroutine: Any) -> None:
                async with limiter:
                    await coroutine

            await asyncio.gather(
                *(
                    limited(self._check_camera(camera, self.settings.monitor_failure_threshold))
                    for camera in cameras
                ),
                *(limited(self.check_recorder(recorder_id, deep=False)) for recorder_id in recorder_ids),
            )
            await self.sync_streams()
            self.last_run_at = models.utcnow()
            self.last_duration_ms = int((time.monotonic() - started) * 1000)

    def _load(self) -> tuple[list[CameraSnapshot], list[str]]:
        with self.session_factory() as session:
            cameras = [self._snapshot(session, camera) for camera in session.scalars(select(models.Camera))]
            recorders = [
                recorder.id for recorder in session.scalars(select(models.Recorder)) if recorder.ip_address
            ]
        return cameras, recorders

    def _snapshot(self, session: Session, camera: models.Camera) -> CameraSnapshot:
        try:
            target = camera_target(session, camera, self.box)
        except ValueError:
            target = None  # nie można odszyfrować hasła (zmieniono SZTUDIO_SECRET_KEY)
        return CameraSnapshot(camera.id, camera.name, camera.stream_name, camera.enabled, target)

    def _load_camera(self, camera_id: str) -> CameraSnapshot | None:
        with self.session_factory() as session:
            camera = session.get(models.Camera, camera_id)
            return self._snapshot(session, camera) if camera else None

    # ---------- kamery ----------

    async def probe_target(self, target: RtspTarget) -> ProbeResult:
        """Test połączenia RTSP z kontrolą polityki adresów."""
        try:
            ip = await to_thread.run_sync(self.policy.resolve, target.host)
        except IntegrationError as error:
            return ProbeResult(False, error.code, error.message)
        return await probe_rtsp(target, ip, self.settings.device_timeout_seconds)

    async def check_camera(self, camera_id: str) -> ProbeResult:
        """Kontrola na żądanie – wynik od razu zmienia stan kamery."""
        camera = await to_thread.run_sync(self._load_camera, camera_id)
        if camera is None:
            return ProbeResult(False, "not_found", "Nie znaleziono kamery.")
        result = await self._check_camera(camera, failure_threshold=1)
        await self.sync_camera_stream(camera_id)
        return result

    async def _check_camera(self, camera: CameraSnapshot, failure_threshold: int) -> ProbeResult:
        if not camera.enabled:
            return ProbeResult(False, "disabled", "Kamera jest wyłączona.")
        if camera.target is None:
            result = ProbeResult(False, "not_configured", "Kamera nie ma skonfigurowanego źródła RTSP.")
        else:
            result = await self.probe_target(camera.target)
        await to_thread.run_sync(self._store_camera_result, camera.id, result, failure_threshold)
        return result

    def _store_camera_result(self, camera_id: str, result: ProbeResult, failure_threshold: int) -> None:
        with self.session_factory() as session:
            camera = session.get(models.Camera, camera_id)
            if camera is None:
                return
            now = models.utcnow()
            if result.code != "not_configured":
                camera.last_attempt_at = now
            camera.response_time_ms = result.response_time_ms
            if result.ok:
                camera.last_success_at = now
                camera.last_error_code = camera.last_error_message = None
                camera.consecutive_failures = 0
                set_camera_status(session, camera, "online")
                camera.signal_quality = quality_from_response_time(result.response_time_ms)
            else:
                camera.last_error_code, camera.last_error_message = result.code, result.message
                camera.consecutive_failures += 1
                # Pojedyncza nieudana próba nie wywołuje alarmu – chroni przed chwilowymi zakłóceniami.
                if camera.consecutive_failures >= failure_threshold or camera.status == "offline":
                    set_camera_status(session, camera, "offline")
            emit_camera(session, camera)
            commit_and_publish(session, self.hub)

    # ---------- rejestratory ----------

    def recorder_adapter(self, recorder: models.Recorder, ip: str, password: str | None = None):
        if password is None and recorder.password_encrypted:
            password = self.box.decrypt(recorder.password_encrypted)
        client = BcsProtocolClient(
            ip=ip,
            http_port=recorder.port or DEFAULT_HTTP_PORT,
            rtsp_port=recorder.rtsp_port or DEFAULT_RTSP_PORT,
            onvif_port=recorder.onvif_port or recorder.port or DEFAULT_ONVIF_PORT,
            username=recorder.username,
            password=password,
            timeout=self.settings.device_timeout_seconds,
        )
        return adapter_for(recorder.series)(
            client, rtsp_path_template=recorder.rtsp_path_template, channel_count=recorder.channels
        )

    async def probe_recorder(
        self, recorder: models.Recorder, *, deep: bool = True
    ) -> tuple[RecorderProbe, OnvifDevice | None]:
        """Weryfikuje protokoły rejestratora. `recorder` może być obiektem niezapisanym (test przed zapisem)."""
        try:
            ip = await to_thread.run_sync(self.policy.resolve, recorder.ip_address or "")
            adapter = self.recorder_adapter(recorder, ip)
        except (IntegrationError, ValueError) as error:
            code = getattr(error, "code", "credentials_unreadable")
            message = getattr(error, "message", "Nie można odczytać zapisanego hasła rejestratora.")
            series = recorder.series
            return RecorderProbe(reachable=False, code=code, message=message, checks=[], adapter=series), None
        return await adapter.probe(deep=deep)

    async def check_recorder(self, recorder_id: str, *, deep: bool = True) -> RecorderProbe | None:
        recorder = await to_thread.run_sync(self._load_recorder, recorder_id)
        if recorder is None:
            return None
        probe, device = await self.probe_recorder(recorder, deep=deep)
        await to_thread.run_sync(self._store_recorder_result, recorder_id, probe, device, deep)
        return probe

    def _load_recorder(self, recorder_id: str) -> models.Recorder | None:
        with self.session_factory() as session:
            recorder = session.get(models.Recorder, recorder_id)
            if recorder is not None:
                session.expunge(recorder)
            return recorder

    def _store_recorder_result(
        self, recorder_id: str, probe: RecorderProbe, device: OnvifDevice | None, deep: bool
    ) -> None:
        from app.api.recorders import notify_recorder  # import lokalny: unika cyklu modułów

        with self.session_factory() as session:
            recorder = session.get(models.Recorder, recorder_id)
            if recorder is None:
                return
            now = models.utcnow()
            recorder.last_attempt_at = now
            times = [check.response_time_ms for check in probe.checks if check.response_time_ms is not None]
            recorder.response_time_ms = min(times) if times else None
            if deep or recorder.protocols is None:
                recorder.protocols = [check.model_dump(mode="json", by_alias=True) for check in probe.checks]
            if probe.reachable:
                recorder.status = "online"
                recorder.last_seen_at = recorder.last_success_at = now
                recorder.consecutive_failures = 0
            else:
                recorder.consecutive_failures += 1
                if recorder.consecutive_failures >= self.settings.monitor_failure_threshold or deep:
                    recorder.status = "offline"
            if probe.code == "ok":
                recorder.last_error_code = recorder.last_error_message = None
            else:
                recorder.last_error_code, recorder.last_error_message = probe.code, probe.message
            if device is not None:
                # Dane odczytane z urządzenia uzupełniają puste pola – nie nadpisują wpisanych ręcznie.
                recorder.model = recorder.model or device.model or ""
                recorder.firmware = recorder.firmware or device.firmware
            notify_recorder(session, "recorder.updated", recorder)
            commit_and_publish(session, self.hub)

    # ---------- go2rtc ----------

    async def refresh_go2rtc(self) -> dict[str, Any]:
        now = models.utcnow()
        if self.go2rtc is None:
            self.go2rtc_health = {"state": "not_configured", "checked_at": now}
            return self.go2rtc_health
        try:
            info = await self.go2rtc.info()
            self.go2rtc_streams = await self.go2rtc.list_streams()
            self.go2rtc_health = {
                "state": "running", "version": info.get("version"), "checked_at": now, "streams": len(self.go2rtc_streams),
            }  # fmt: skip
        except Go2rtcError as error:
            self.go2rtc_streams = {}
            self._registered.clear()
            self.go2rtc_health = {
                "state": "error",
                "error_code": error.code,
                "error_message": error.message,
                "checked_at": now,
            }
        return self.go2rtc_health

    async def sync_streams(self) -> None:
        """Doprowadza listę strumieni go2rtc do zgodności z konfiguracją kamer."""
        cameras, _ = await to_thread.run_sync(self._load)
        states = {camera.id: await self._sync_stream(camera) for camera in cameras}
        if self.go2rtc is not None and self.go2rtc_health.get("state") == "running":
            wanted = {camera.stream_name for camera in cameras if states[camera.id] == "registered"}
            for name in set(self.go2rtc_streams) - wanted:
                await self._remove(name)
        await to_thread.run_sync(self._store_stream_states, states)

    async def sync_camera_stream(self, camera_id: str) -> str:
        camera = await to_thread.run_sync(self._load_camera, camera_id)
        if camera is None:
            return "not_configured"
        state = await self._sync_stream(camera)
        await to_thread.run_sync(self._store_stream_states, {camera.id: state})
        return state

    async def remove_stream(self, stream_name: str) -> None:
        if self.go2rtc is not None:
            await self._remove(stream_name)

    async def _remove(self, name: str) -> None:
        self._registered.pop(name, None)
        try:
            await self.go2rtc.delete_stream(name)
            self.go2rtc_streams.pop(name, None)
        except Go2rtcError:
            pass  # zostanie usunięty przy następnej synchronizacji

    async def _sync_stream(self, camera: CameraSnapshot) -> str:
        if self.go2rtc is None:
            return "not_configured"
        if not camera.enabled or camera.target is None:
            if camera.stream_name in self.go2rtc_streams or camera.stream_name in self._registered:
                await self._remove(camera.stream_name)
            return "disabled" if not camera.enabled else "not_configured"
        try:
            # go2rtc dostaje zweryfikowany adres IP, a nie nazwę – nie rozwiązuje jej samodzielnie.
            ip = await to_thread.run_sync(self.policy.resolve, camera.target.host)
            source = camera.target.url(credentials=True, host=ip)
            digest = hashlib.sha256(source.encode()).hexdigest()
            if (
                self._registered.get(camera.stream_name) != digest
                or camera.stream_name not in self.go2rtc_streams
            ):
                await self.go2rtc.put_stream(camera.stream_name, source)
                self._registered[camera.stream_name] = digest
                self.go2rtc_streams.setdefault(
                    camera.stream_name, Go2rtcStream(camera.stream_name, (), 0, False)
                )
            return "registered"
        except IntegrationError as error:
            logger.warning("Strumień kamery „%s” nie został zarejestrowany: %s", camera.name, error.code)
            if camera.stream_name in self.go2rtc_streams:
                await self._remove(camera.stream_name)
            return "error"

    def _store_stream_states(self, states: dict[str, str]) -> None:
        with self.session_factory() as session:
            for camera_id, state in states.items():
                camera = session.get(models.Camera, camera_id)
                if camera is not None and camera.stream_state != state:
                    camera.stream_state = state
                    emit_camera(session, camera)
            commit_and_publish(session, self.hub)

    async def webrtc_answer(self, camera_id: str, offer_sdp: str) -> str:
        """Sygnalizacja WebRTC dla kamery: oferta przeglądarki → odpowiedź go2rtc."""
        if self.go2rtc is None:
            raise Go2rtcError("go2rtc_not_configured", "Usługa strumieni (go2rtc) nie jest skonfigurowana.")
        camera = await to_thread.run_sync(self._load_camera, camera_id)
        if camera is None:
            raise IntegrationError("not_found", "Nie znaleziono kamery.")
        if not camera.enabled:
            raise IntegrationError("disabled", "Kamera jest wyłączona.")
        if camera.target is None:
            raise IntegrationError("not_configured", "Kamera nie ma skonfigurowanego źródła RTSP.")
        try:
            return await self.go2rtc.webrtc(camera.stream_name, offer_sdp)
        except Go2rtcError as error:
            if error.code != "stream_not_registered":
                raise
        # go2rtc został zrestartowany i nie zna strumienia – rejestrujemy go i ponawiamy raz.
        self._registered.pop(camera.stream_name, None)
        self.go2rtc_streams.pop(camera.stream_name, None)
        if await self.sync_camera_stream(camera_id) != "registered":
            raise Go2rtcError("stream_unavailable", "Nie udało się zarejestrować strumienia kamery w go2rtc.")
        return await self.go2rtc.webrtc(camera.stream_name, offer_sdp)
