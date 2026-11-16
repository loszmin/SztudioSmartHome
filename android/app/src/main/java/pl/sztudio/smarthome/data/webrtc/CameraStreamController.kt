package pl.sztudio.smarthome.data.webrtc

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.webrtc.VideoSink
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.data.api.ErrorMapper
import pl.sztudio.smarthome.domain.repository.StreamSignaling

sealed interface StreamState {
    data object Idle : StreamState
    data class Connecting(val attempt: Int) : StreamState
    data object Playing : StreamState

    /** Połączenie przerwane lub niezestawione – kolejna próba za [retryInSeconds]. */
    data class Reconnecting(val reason: String, val retryInSeconds: Int, val attempt: Int) : StreamState

    /** Błąd, którego ponawianie nie naprawi (kamera wyłączona, brak źródła, brak uprawnień). */
    data class Failed(val reason: String, val code: String?) : StreamState
}

/**
 * Cykl życia podglądu jednej kamery: sygnalizacja przez Core, monitorowanie połączenia,
 * ponawianie po utracie sygnału lub restarcie go2rtc, zwalnianie zasobów przy [stop].
 */
class CameraStreamController(
    val cameraId: String,
    private val signaling: StreamSignaling,
    private val factory: PeerSessionFactory,
    private val scope: CoroutineScope,
    private val retryDelaysMs: List<Long> = listOf(2_000, 5_000, 10_000, 20_000, 30_000),
    private val connectTimeoutMs: Long = 15_000,
    private val disconnectGraceMs: Long = 4_000,
) {
    private val _state = MutableStateFlow<StreamState>(StreamState.Idle)
    val state: StateFlow<StreamState> = _state.asStateFlow()

    private var job: Job? = null
    @Volatile private var session: PeerSession? = null
    private var sink: VideoSink? = null

    val isRunning: Boolean get() = job?.isActive == true

    @Synchronized
    fun start(sink: VideoSink) {
        if (isRunning && this.sink === sink) return
        stop()
        this.sink = sink
        job = scope.launch { run(sink) }
    }

    /** Zatrzymuje podgląd i zamyka połączenie (ekran niewidoczny, aplikacja w tle). */
    @Synchronized
    fun stop() {
        job?.cancel()
        job = null
        session?.close()
        session = null
        _state.value = StreamState.Idle
    }

    @Synchronized
    fun retryNow() {
        sink?.let { start(it.also { stop() }) }
    }

    private suspend fun run(sink: VideoSink) {
        var failures = 0
        while (scope.isActive) {
            _state.value = StreamState.Connecting(failures + 1)
            val peer = factory.create(sink)
            session = peer
            val reason: String = try {
                val offer = peer.createOffer()
                val answer = signaling.exchangeOffer(cameraId, offer)
                peer.setAnswer(answer)
                if (awaitConnected(peer)) {
                    failures = 0
                    awaitBroken(peer)
                } else {
                    "Nie udało się zestawić połączenia z obrazem kamery."
                }
            } catch (cancel: CancellationException) {
                peer.close()
                throw cancel
            } catch (error: Throwable) {
                val mapped = runCatching { ErrorMapper.fromThrowable(error) }.getOrElse { throw it }
                if (mapped.isPermanent()) {
                    peer.close()
                    session = null
                    _state.value = StreamState.Failed(mapped.userMessage, mapped.code)
                    return
                }
                mapped.userMessage
            }
            peer.close()
            session = null
            failures += 1
            val wait = retryDelaysMs[minOf(failures, retryDelaysMs.size) - 1]
            _state.value = StreamState.Reconnecting(reason, ((wait + 999) / 1000).toInt(), failures)
            delay(wait)
        }
    }

    private suspend fun awaitConnected(peer: PeerSession): Boolean {
        val result = withTimeoutOrNull(connectTimeoutMs) {
            peer.state.first { it == PeerState.CONNECTED || it == PeerState.FAILED || it == PeerState.CLOSED }
        }
        if (result == PeerState.CONNECTED) {
            _state.value = StreamState.Playing
            return true
        }
        return false
    }

    /** Czeka na trwałą utratę połączenia. Krótkie rozłączenie (np. zmiana Wi-Fi) może się samo naprawić. */
    private suspend fun awaitBroken(peer: PeerSession): String {
        while (true) {
            val event = peer.state.first { it == PeerState.DISCONNECTED || it == PeerState.FAILED || it == PeerState.CLOSED }
            if (event != PeerState.DISCONNECTED) return "Połączenie z obrazem kamery zostało przerwane."
            val recovered = withTimeoutOrNull(disconnectGraceMs) {
                peer.state.first { it == PeerState.CONNECTED || it == PeerState.FAILED || it == PeerState.CLOSED }
            }
            if (recovered != PeerState.CONNECTED) return "Utracono sygnał z kamery."
            _state.value = StreamState.Playing
        }
    }

    private fun AppError.isPermanent(): Boolean = when (this) {
        is AppError.NotFound, is AppError.Forbidden, AppError.SessionExpired, AppError.UntrustedCertificate,
        AppError.CertificateHostMismatch -> true
        is AppError.Server -> code in setOf("disabled", "not_configured", "go2rtc_not_configured", "invalid_offer")
        else -> false
    }
}

/**
 * Pula kontrolerów: jeden na widoczną kamerę. Kontroler kamery, która zniknęła z ekranu,
 * jest zatrzymywany i usuwany – aplikacja nie utrzymuje niewidocznych strumieni.
 */
class CameraStreamManager(
    private val signaling: StreamSignaling,
    private val factory: () -> PeerSessionFactory,
    private val scope: CoroutineScope,
) {
    private val controllers = mutableMapOf<String, Pair<CameraStreamController, Int>>()

    val activeCount: Int @Synchronized get() = controllers.values.count { it.first.isRunning }

    @Synchronized
    fun acquire(cameraId: String): CameraStreamController {
        val (controller, users) = controllers[cameraId] ?: (CameraStreamController(cameraId, signaling, factory(), scope) to 0)
        controllers[cameraId] = controller to users + 1
        return controller
    }

    @Synchronized
    fun release(controller: CameraStreamController) {
        val (current, users) = controllers[controller.cameraId] ?: return
        if (current !== controller) return
        if (users <= 1) {
            controller.stop()
            controllers.remove(controller.cameraId)
        } else {
            controllers[controller.cameraId] = controller to users - 1
        }
    }

    @Synchronized
    fun stopAll() {
        controllers.values.forEach { it.first.stop() }
        controllers.clear()
    }
}
