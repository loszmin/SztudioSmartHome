package pl.sztudio.smarthome.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import pl.sztudio.smarthome.core.ServerUrl
import pl.sztudio.smarthome.data.websocket.RealtimeClient
import pl.sztudio.smarthome.data.websocket.RealtimeMessage
import pl.sztudio.smarthome.domain.repository.ChannelState
import pl.sztudio.smarthome.domain.repository.RealtimeChannel
import pl.sztudio.smarthome.testutil.TlsFixture
import pl.sztudio.smarthome.testutil.TokenHolder
import pl.sztudio.smarthome.testutil.baseUrl
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/** Kanały WebSocket przez WSS z lokalnym CA – zachowanie jak przy prawdziwym Core (`core/app/ws.py`). */
class RealtimeClientTest {
    private val tls = TlsFixture()
    private lateinit var server: MockWebServer
    private val sockets = ConcurrentHashMap<String, WebSocket>()
    private val paths = CopyOnWriteArrayList<String>()
    private var rejectToken = false
    private var unauthorized = 0
    private lateinit var client: RealtimeClient

    @Before
    fun setUp() {
        server = tls.server()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path.orEmpty()
                paths += path
                val channel = path.removePrefix("/ws/v1/").substringBefore('?')
                return MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        if (rejectToken) {
                            webSocket.close(4401, null)
                            return
                        }
                        sockets[channel] = webSocket
                        webSocket.send("""{"type":"connected","data":{"channel":"$channel"}}""")
                    }
                })
            }
        }
        server.start()
        client = RealtimeClient(tls.client(TokenHolder()), CoroutineScope(SupervisorJob() + Dispatchers.IO), { unauthorized++ }, retryDelaysMs = listOf(100, 200))
    }

    @After
    fun tearDown() {
        client.stop()
        sockets.values.forEach { runCatching { it.close(1001, null) } }
        runCatching { server.shutdown() }
    }

    private suspend fun awaitAll(state: ChannelState) = withTimeout(5_000) { client.channels.first { map -> map.values.all { it == state } } }

    @Test
    fun `cztery kanaly z tokenem i przekazywanie komunikatow`() = runBlocking {
        val received = CopyOnWriteArrayList<RealtimeMessage>()
        val collector = launch(Dispatchers.IO) { client.messages.collect { received += it } }
        client.start(ServerUrl.of(server.baseUrl()), "tok en/+")
        awaitAll(ChannelState.OPEN)

        assertEquals(setOf("events", "system", "cameras", "alarms"), paths.map { it.removePrefix("/ws/v1/").substringBefore('?') }.toSet())
        assertTrue(paths.all { it.endsWith("?token=tok+en%2F%2B") })

        sockets.getValue("alarms").send("""{"type":"alarm.created","data":{"id":"a1"},"timestamp":"2026-11-15T12:00:00Z"}""")
        sockets.getValue("events").send("niepoprawny json")
        sockets.getValue("cameras").send("""{"type":"camera.updated","data":{}}""")
        withTimeout(5_000) { while (received.size < 2) kotlinx.coroutines.delay(20) }
        // „connected” i niepoprawne komunikaty są pomijane (kolejność między kanałami nie jest gwarantowana).
        assertEquals(setOf(RealtimeMessage(RealtimeChannel.ALARMS, "alarm.created"), RealtimeMessage(RealtimeChannel.CAMERAS, "camera.updated")), received.toSet())
        assertEquals(2, received.size)
        collector.cancel()
    }

    @Test
    fun `po zerwaniu polaczenia kanal sam laczy sie ponownie`() = runBlocking {
        client.start(ServerUrl.of(server.baseUrl()), "token")
        awaitAll(ChannelState.OPEN)
        val before = paths.size
        sockets.getValue("events").close(1011, "restart Core")

        withTimeout(5_000) { client.channels.first { it[RealtimeChannel.EVENTS] == ChannelState.RETRYING || paths.size > before } }
        awaitAll(ChannelState.OPEN)
        assertEquals(before + 1, paths.size)
    }

    @Test
    fun `kod 4401 konczy sesje bez ponawiania`() = runBlocking {
        rejectToken = true
        client.start(ServerUrl.of(server.baseUrl()), "zly-token")
        awaitAll(ChannelState.IDLE)
        withTimeout(5_000) { while (unauthorized < 4) kotlinx.coroutines.delay(20) }
        val attempts = paths.size
        kotlinx.coroutines.delay(500)
        assertEquals("brak ponownych prób z nieważnym tokenem", attempts, paths.size)
    }

    @Test
    fun `zatrzymanie zamyka kanaly`() = runBlocking {
        client.start(ServerUrl.of(server.baseUrl()), "token")
        awaitAll(ChannelState.OPEN)
        client.stop()
        assertTrue(client.channels.value.values.all { it == ChannelState.IDLE })
        assertTrue(!client.isRunning)
    }
}
