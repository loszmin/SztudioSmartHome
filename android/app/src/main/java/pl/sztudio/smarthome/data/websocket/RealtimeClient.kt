package pl.sztudio.smarthome.data.websocket

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import pl.sztudio.smarthome.core.ServerUrl
import pl.sztudio.smarthome.data.api.ApiJson
import pl.sztudio.smarthome.data.api.RealtimeMessageDto
import pl.sztudio.smarthome.domain.repository.ChannelState
import pl.sztudio.smarthome.domain.repository.RealtimeChannel
import pl.sztudio.smarthome.domain.repository.RealtimeRepository
import java.net.URLEncoder

data class RealtimeMessage(val channel: RealtimeChannel, val type: String)

/**
 * Kanały WebSocket Sztudio Core (`wss://…/ws/v1/{kanał}?token=`). Każdy kanał łączy się niezależnie
 * i po zerwaniu ponawia połączenie z rosnącym odstępem. Kod 4401 (nieważny token) kończy sesję.
 */
class RealtimeClient(
    private val client: OkHttpClient,
    private val scope: CoroutineScope,
    private val onUnauthorized: () -> Unit,
    private val retryDelaysMs: List<Long> = listOf(1_000, 2_000, 4_000, 8_000, 16_000, 30_000),
) : RealtimeRepository {

    private val _channels = MutableStateFlow(RealtimeChannel.entries.associateWith { ChannelState.IDLE })
    override val channels: StateFlow<Map<RealtimeChannel, ChannelState>> = _channels.asStateFlow()

    private val _messages = MutableSharedFlow<RealtimeMessage>(extraBufferCapacity = 64)
    val messages: SharedFlow<RealtimeMessage> = _messages.asSharedFlow()

    private class Connection(val generation: Int) {
        var socket: WebSocket? = null
        var retryJob: Job? = null
        var failures = 0
    }

    private val lock = Any()
    private var target: Pair<ServerUrl, String>? = null
    private val connections = mutableMapOf<RealtimeChannel, Connection>()
    private var generation = 0

    val isRunning: Boolean get() = synchronized(lock) { target != null }

    fun start(server: ServerUrl, token: String): Unit = synchronized(lock) {
        if (target == server to token) return
        stopLocked()
        target = server to token
        RealtimeChannel.entries.forEach { open(it, failures = 0) }
    }

    fun stop(): Unit = synchronized(lock) { stopLocked() }

    /** Natychmiastowa próba połączenia kanałów oczekujących na ponowienie (np. po odzyskaniu sieci). */
    fun reconnectNow(): Unit = synchronized(lock) {
        if (target == null) return
        connections.filterValues { it.retryJob?.isActive == true }.forEach { (channel, connection) ->
            connection.retryJob?.cancel()
            open(channel, connection.failures)
        }
    }

    private fun stopLocked() {
        target = null
        generation += 1
        connections.values.forEach {
            it.retryJob?.cancel()
            it.socket?.close(NORMAL_CLOSURE, null)
        }
        connections.clear()
        _channels.value = RealtimeChannel.entries.associateWith { ChannelState.IDLE }
    }

    private fun open(channel: RealtimeChannel, failures: Int) {
        val (server, token) = target ?: return
        val connection = Connection(++generation).also { it.failures = failures }
        connections[channel] = connection
        setState(channel, ChannelState.CONNECTING)
        val url = server.webSocket("/ws/v1/${channel.path}?token=" + URLEncoder.encode(token, "UTF-8"))
        connection.socket = client.newWebSocket(Request.Builder().url(url).build(), Listener(channel, connection.generation))
    }

    private fun isCurrent(channel: RealtimeChannel, generation: Int) = connections[channel]?.generation == generation

    private fun setState(channel: RealtimeChannel, state: ChannelState) = _channels.update { it + (channel to state) }

    private fun handleClosed(channel: RealtimeChannel, generation: Int, code: Int?): Unit = synchronized(lock) {
        if (target == null || !isCurrent(channel, generation)) return
        val connection = connections.getValue(channel)
        connection.socket = null
        when (code) {
            UNAUTHORIZED -> {
                setState(channel, ChannelState.IDLE)
                scope.launch { onUnauthorized() }
            }
            UNKNOWN_CHANNEL -> setState(channel, ChannelState.IDLE)
            else -> {
                connection.failures += 1
                val wait = retryDelaysMs[minOf(connection.failures, retryDelaysMs.size) - 1]
                setState(channel, ChannelState.RETRYING)
                connection.retryJob = scope.launch {
                    delay(wait)
                    synchronized(lock) { if (isCurrent(channel, generation)) open(channel, connection.failures) }
                }
            }
        }
    }

    private inner class Listener(private val channel: RealtimeChannel, private val generation: Int) : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response): Unit = synchronized(lock) {
            if (!isCurrent(channel, generation)) return
            connections[channel]?.failures = 0
            setState(channel, ChannelState.OPEN)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            if (!synchronized(lock) { isCurrent(channel, generation) }) return
            val type = runCatching { ApiJson.decodeFromString(RealtimeMessageDto.serializer(), text).type }.getOrNull() ?: return
            if (type != "connected") _messages.tryEmit(RealtimeMessage(channel, type))
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(code, null)
            handleClosed(channel, generation, code)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = handleClosed(channel, generation, code)

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = handleClosed(channel, generation, null)
    }

    companion object {
        const val NORMAL_CLOSURE = 1000
        const val UNAUTHORIZED = 4401
        const val UNKNOWN_CHANNEL = 4404
    }
}
