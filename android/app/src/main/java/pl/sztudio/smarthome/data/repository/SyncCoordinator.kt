package pl.sztudio.smarthome.data.repository

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import pl.sztudio.smarthome.core.ServerUrl
import pl.sztudio.smarthome.data.local.NetworkMonitor
import pl.sztudio.smarthome.data.websocket.RealtimeClient
import pl.sztudio.smarthome.domain.model.Session
import pl.sztudio.smarthome.domain.repository.ChannelState
import pl.sztudio.smarthome.domain.repository.MonitoringRepository
import pl.sztudio.smarthome.domain.repository.RealtimeChannel

/** Zasób odświeżany po komunikacie z danego kanału (tak samo jak w panelu WWW). */
enum class Resource { STATUS, CAMERAS, ALARMS, SENSORS, EVENTS }

internal val CHANNEL_RESOURCES: Map<RealtimeChannel, Set<Resource>> = mapOf(
    RealtimeChannel.EVENTS to setOf(Resource.EVENTS),
    RealtimeChannel.ALARMS to setOf(Resource.ALARMS, Resource.SENSORS, Resource.STATUS),
    RealtimeChannel.CAMERAS to setOf(Resource.CAMERAS),
    RealtimeChannel.SYSTEM to setOf(Resource.STATUS),
)

/**
 * Utrzymuje aktualność danych, gdy aplikacja jest na pierwszym planie:
 * - komunikat WebSocket → odświeżenie powiązanych zasobów (z krótkim zgrupowaniem),
 * - odzyskanie sieci → natychmiastowe połączenie kanałów i odświeżenie,
 * - zapasowe odpytywanie, gdy kanały WebSocket nie działają (bez zbędnego ruchu, gdy działają).
 * W tle połączenia są zamykane.
 */
class SyncCoordinator(
    private val repository: MonitoringRepository,
    private val realtime: RealtimeClient,
    private val network: NetworkMonitor,
    private val scope: CoroutineScope,
    private val debounceMs: Long = 300,
    private val fallbackPollMs: Long = 30_000,
    private val statusPollMs: Long = 60_000,
) {
    private var jobs: List<Job> = emptyList()
    private val pending = mutableSetOf<Resource>()
    private var flushJob: Job? = null

    val isActive: Boolean get() = jobs.isNotEmpty()

    @Synchronized
    fun start(session: Session) {
        stop()
        realtime.start(ServerUrl.of(session.serverUrl), session.token)
        jobs = listOf(
            scope.launch { repository.refreshAll() },
            scope.launch { realtime.messages.collect { message -> CHANNEL_RESOURCES[message.channel]?.let(::schedule) } },
            scope.launch {
                network.isOnline.filter { it }.collect {
                    realtime.reconnectNow()
                    repository.refreshAll()
                }
            },
            scope.launch {
                while (true) {
                    val allOpen = realtime.channels.value.values.all { it == ChannelState.OPEN }
                    delay(if (allOpen) statusPollMs else fallbackPollMs)
                    if (realtime.channels.value.values.all { it == ChannelState.OPEN }) {
                        repository.refreshStatus() // czas pracy i zasoby hosta nie mają komunikatów WebSocket
                    } else {
                        repository.refreshAll()
                    }
                }
            },
        )
    }

    @Synchronized
    fun stop() {
        jobs.forEach { it.cancel() }
        jobs = emptyList()
        flushJob?.cancel()
        synchronized(pending) { pending.clear() }
        realtime.stop()
    }

    private fun schedule(resources: Set<Resource>) {
        synchronized(pending) { pending += resources }
        if (flushJob?.isActive == true) return
        flushJob = scope.launch {
            delay(debounceMs)
            val batch = synchronized(pending) { pending.toSet().also { pending.clear() } }
            batch.forEach { resource ->
                launch {
                    when (resource) {
                        Resource.STATUS -> repository.refreshStatus()
                        Resource.CAMERAS -> repository.refreshCameras()
                        Resource.ALARMS -> repository.refreshAlarms()
                        Resource.SENSORS -> repository.refreshSensors()
                        Resource.EVENTS -> repository.refreshRecentEvents()
                    }
                }
            }
        }
    }
}
