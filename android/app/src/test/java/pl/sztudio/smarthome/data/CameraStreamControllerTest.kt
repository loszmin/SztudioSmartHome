package pl.sztudio.smarthome.data

import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.webrtc.VideoSink
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.data.webrtc.CameraStreamController
import pl.sztudio.smarthome.data.webrtc.CameraStreamManager
import pl.sztudio.smarthome.data.webrtc.PeerSession
import pl.sztudio.smarthome.data.webrtc.PeerSessionFactory
import pl.sztudio.smarthome.data.webrtc.PeerState
import pl.sztudio.smarthome.data.webrtc.StreamState
import pl.sztudio.smarthome.domain.repository.StreamSignaling

/** Cykl życia podglądu – sesja WebRTC zastąpiona atrapą (biblioteki natywne nie działają na JVM). */
@OptIn(ExperimentalCoroutinesApi::class)
class CameraStreamControllerTest {
    private class FakePeer : PeerSession {
        override val state = MutableStateFlow(PeerState.NEW)
        var answer: String? = null
        var closed = false
        override suspend fun createOffer() = "v=0\r\noffer\r\n"
        override suspend fun setAnswer(sdp: String) { answer = sdp }
        override fun close() { closed = true; state.value = PeerState.CLOSED }
    }

    private val peers = mutableListOf<FakePeer>()
    private val factory = PeerSessionFactory { FakePeer().also { peers += it } }
    private val sink = mockk<VideoSink>(relaxed = true)
    private val offers = mutableListOf<String>()
    private var signalingError: Throwable? = null
    private val signaling = StreamSignaling { cameraId, offer ->
        offers += "$cameraId:$offer"
        signalingError?.let { throw it }
        "v=0\r\nanswer\r\n"
    }

    private fun TestScope.controller() = CameraStreamController("c1", signaling, factory, backgroundScope, retryDelaysMs = listOf(2_000, 5_000), connectTimeoutMs = 15_000, disconnectGraceMs = 4_000)

    @Test
    fun `oferta przez Core, odpowiedz i odtwarzanie po polaczeniu`() = runTest(StandardTestDispatcher()) {
        val controller = controller()
        controller.start(sink)
        runCurrent()
        assertEquals(StreamState.Connecting(1), controller.state.value)
        assertEquals(listOf("c1:v=0\r\noffer\r\n"), offers)
        assertEquals("v=0\r\nanswer\r\n", peers.single().answer)

        peers.single().state.value = PeerState.CONNECTED
        runCurrent()
        assertEquals(StreamState.Playing, controller.state.value)
    }

    @Test
    fun `utrata sygnalu - krotkie rozlaczenie nie przerywa obrazu, trwale powoduje ponowne polaczenie`() = runTest(StandardTestDispatcher()) {
        val controller = controller()
        controller.start(sink)
        runCurrent()
        peers[0].state.value = PeerState.CONNECTED
        runCurrent()

        peers[0].state.value = PeerState.DISCONNECTED
        advanceTimeBy(2_000)
        peers[0].state.value = PeerState.CONNECTED
        runCurrent()
        assertEquals(StreamState.Playing, controller.state.value)
        assertEquals(1, peers.size)

        peers[0].state.value = PeerState.DISCONNECTED
        advanceTimeBy(4_001)
        runCurrent()
        val reconnecting = controller.state.value as StreamState.Reconnecting
        assertEquals(2, reconnecting.retryInSeconds)
        assertTrue("stara sesja zamknięta", peers[0].closed)

        advanceTimeBy(2_001)
        runCurrent()
        assertEquals(2, peers.size)
        peers[1].state.value = PeerState.CONNECTED
        runCurrent()
        assertEquals(StreamState.Playing, controller.state.value)
    }

    @Test
    fun `restart go2rtc - blad sygnalizacji jest ponawiany z rosnacym odstepem`() = runTest(StandardTestDispatcher()) {
        signalingError = AppError.Server(502, "Brak połączenia z usługą go2rtc.", "go2rtc_unavailable")
        val controller = controller()
        controller.start(sink)
        runCurrent()
        assertEquals(StreamState.Reconnecting("Brak połączenia z usługą go2rtc.", 2, 1), controller.state.value)

        advanceTimeBy(2_001); runCurrent()
        assertEquals(5, (controller.state.value as StreamState.Reconnecting).retryInSeconds)

        signalingError = null // go2rtc wrócił
        advanceTimeBy(5_001); runCurrent()
        peers.last().state.value = PeerState.CONNECTED
        runCurrent()
        assertEquals(StreamState.Playing, controller.state.value)
        assertEquals(3, offers.size)
        assertTrue(peers.dropLast(1).all { it.closed })
    }

    @Test
    fun `brak polaczenia w wyznaczonym czasie powoduje ponowienie`() = runTest(StandardTestDispatcher()) {
        val controller = controller()
        controller.start(sink)
        runCurrent()
        advanceTimeBy(15_001); runCurrent()
        assertTrue(controller.state.value is StreamState.Reconnecting)
        assertTrue(peers[0].closed)
    }

    @Test
    fun `bledy trwale nie sa ponawiane`() = runTest(StandardTestDispatcher()) {
        signalingError = AppError.Server(409, "Kamera jest wyłączona.", "disabled")
        val controller = controller()
        controller.start(sink)
        runCurrent()
        advanceTimeBy(60_000); runCurrent()
        assertEquals(StreamState.Failed("Kamera jest wyłączona.", "disabled"), controller.state.value)
        assertEquals(1, offers.size)
        assertTrue(peers.single().closed)
    }

    @Test
    fun `zatrzymanie zamyka sesje i anuluje ponawianie`() = runTest(StandardTestDispatcher()) {
        signalingError = AppError.Unreachable
        val controller = controller()
        controller.start(sink)
        runCurrent()
        controller.stop()
        advanceTimeBy(60_000); runCurrent()
        assertEquals(StreamState.Idle, controller.state.value)
        assertEquals(1, offers.size)
        assertTrue(peers.all { it.closed })
    }

    @Test
    fun `pula kontrolerow - kamera znikajaca z ekranu przestaje nadawac`() = runTest(StandardTestDispatcher()) {
        val manager = CameraStreamManager(signaling, { factory }, backgroundScope)
        val first = manager.acquire("c1")
        val again = manager.acquire("c1")
        assertTrue("ta sama kamera współdzieli kontroler", first === again)
        first.start(sink)
        runCurrent()
        assertEquals(1, manager.activeCount)

        manager.release(first)
        assertEquals(1, manager.activeCount) // drugi użytkownik nadal ogląda
        manager.release(again)
        assertEquals(0, manager.activeCount)
        assertTrue(peers.single().closed)
        assertTrue("po zwolnieniu powstaje nowy kontroler", manager.acquire("c1") !== first)
    }
}
