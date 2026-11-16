package pl.sztudio.smarthome.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.data.api.ApiProvider
import pl.sztudio.smarthome.data.local.SnapshotCache
import pl.sztudio.smarthome.data.repository.MonitoringRepositoryImpl
import pl.sztudio.smarthome.domain.model.AlarmStatus
import pl.sztudio.smarthome.domain.model.ArmingMode
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.model.EventCategory
import pl.sztudio.smarthome.domain.model.EventQuery
import pl.sztudio.smarthome.domain.model.SensorType
import pl.sztudio.smarthome.domain.model.StreamRegistration
import pl.sztudio.smarthome.testutil.ALARMS_JSON
import pl.sztudio.smarthome.testutil.CAMERAS_JSON
import pl.sztudio.smarthome.testutil.DIAGNOSTICS_JSON
import pl.sztudio.smarthome.testutil.EVENTS_JSON
import pl.sztudio.smarthome.testutil.FakeCryptoBox
import pl.sztudio.smarthome.testutil.SENSORS_JSON
import pl.sztudio.smarthome.testutil.STATUS_JSON
import pl.sztudio.smarthome.testutil.TlsFixture
import pl.sztudio.smarthome.testutil.TokenHolder
import pl.sztudio.smarthome.testutil.baseUrl
import pl.sztudio.smarthome.testutil.json
import pl.sztudio.smarthome.testutil.session
import java.io.File
import java.time.Instant

class MonitoringRepositoryTest {
    @get:Rule val folder = TemporaryFolder()

    private val tls = TlsFixture()
    private lateinit var server: MockWebServer
    private val tokens = TokenHolder("jwt-token")
    private val crypto = FakeCryptoBox()
    private lateinit var cacheFile: File
    private lateinit var repository: MonitoringRepositoryImpl
    private var available = true
    private val requests = mutableListOf<RecordedRequest>()

    @Before
    fun setUp() {
        server = tls.server()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                synchronized(requests) { requests += request }
                if (!available) return MockResponse().setResponseCode(503).setBody("""{"detail":"Serwer niedostępny"}""")
                val path = request.path.orEmpty()
                return when {
                    path == "/api/v1/system/status" -> json(STATUS_JSON)
                    path == "/api/v1/cameras" -> json(CAMERAS_JSON)
                    path.startsWith("/api/v1/alarms?") -> json(ALARMS_JSON)
                    path == "/api/v1/sensors" -> json(SENSORS_JSON)
                    path.startsWith("/api/v1/events") -> json(EVENTS_JSON)
                    path == "/api/v1/diagnostics" -> json(DIAGNOSTICS_JSON)
                    path == "/api/v1/alarms/a1/acknowledge" -> json("""{"id":"a1","title":"Wykrycie dymu","severity":"critical","status":"acknowledged","source":{"type":"sensor","name":"Dym"},"triggeredAt":"2026-11-15T11:59:00Z","acknowledgedAt":"2026-11-15T12:01:00Z","acknowledgedBy":"admin"}""")
                    path == "/api/v1/alarms/arming" -> json("""{"mode":"armed_away","changedAt":"2026-11-15T12:02:00Z","changedBy":"admin"}""")
                    path == "/api/v1/cameras/c1/webrtc" -> MockResponse().setHeader("Content-Type", "application/sdp").setBody("v=0\r\nanswer\r\n")
                    path == "/api/v1/cameras/c2/webrtc" -> json("""{"detail":{"code":"disabled","message":"Kamera jest wyłączona."}}""", 409)
                    else -> MockResponse().setResponseCode(404)
                }
            }
        }
        server.start()
        cacheFile = File(folder.root, "snapshot.bin")
        repository = newRepository()
    }

    private fun newRepository() = MonitoringRepositoryImpl(
        ApiProvider(tls.client(tokens) { repository.recordTiming(it) }),
        { session(server = server.baseUrl()) },
        SnapshotCache(cacheFile, crypto),
        CoroutineScope(SupervisorJob() + Dispatchers.IO),
    )

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun `odswiezenie mapuje odpowiedzi Core na model domenowy`() = runBlocking {
        repository.refreshAll()

        val status = repository.status.value.data!!
        assertEquals(ArmingMode.ARMED_HOME, status.alarmSystem.mode)
        assertEquals("running", status.go2rtc?.state?.name?.lowercase())

        val cameras = repository.cameras.value.data!!
        assertEquals(listOf("c1", "c2", "c3"), cameras.map { it.id })
        assertTrue(cameras[0].canStream)
        assertFalse("kamera offline nie zestawia strumienia", cameras[1].canStream)
        assertEquals(StreamRegistration.NOT_CONFIGURED, cameras[2].streamState)
        assertNull(cameras[1].lastSeenAt)

        val alarms = repository.alarms.value.data!!
        assertEquals(AlarmStatus.ACTIVE, alarms[0].status)
        assertTrue(alarms[1].isFailure)

        val sensors = repository.sensors.value.data!!
        assertEquals(SensorType.TEMPERATURE, sensors[1].type)
        assertEquals(21.5, sensors[1].value!!, 0.0)
        assertEquals(ConnectionStatus.OFFLINE, sensors[2].connection)

        // Nieznana kategoria z nowszej wersji Core nie przerywa działania.
        assertNull(repository.recentEvents.value.data!![2].category)

        // Każde żądanie niesie token; aplikacja mierzy czas odpowiedzi.
        assertTrue(requests.all { it.getHeader("Authorization") == "Bearer jwt-token" })
        assertTrue(repository.apiTimings.value.size >= 5)
    }

    @Test
    fun `utrata polaczenia zostawia ostatnie dane oznaczone jako nieaktualne`() = runBlocking {
        repository.refreshCameras()
        available = false
        repository.refreshCameras()

        val cameras = repository.cameras.value
        assertEquals(3, cameras.data!!.size)
        assertTrue(cameras.isStale)
        assertTrue(cameras.error is AppError.Server)
        assertEquals("Kamery", repository.clientErrors.value.first().context)

        available = true
        repository.refreshCameras()
        assertFalse(repository.cameras.value.isStale)
    }

    @Test
    fun `ostatni stan jest zapisany zaszyfrowany i wczytany jako nieaktualny`() = runBlocking {
        repository.refreshAll()
        delay(1_500) // zapis jest grupowany
        assertTrue(cacheFile.exists())
        assertFalse("migawka jest zaszyfrowana", cacheFile.readText().contains("Wejście"))

        val restarted = newRepository()
        restarted.loadCached(server.baseUrl())
        val cameras = restarted.cameras.value
        assertEquals(3, cameras.data!!.size)
        assertTrue(cameras.fromCache && cameras.isStale)
        assertNotNull(cameras.updatedAt)

        // Migawka innego serwera nie jest pokazywana.
        val other = newRepository()
        other.loadCached("https://inny-serwer")
        assertNull(other.cameras.value.data)

        repository.clear()
        assertFalse(cacheFile.exists())
    }

    @Test
    fun `potwierdzenie alarmu i zmiana trybu wywoluja wlasciwe endpointy`() = runBlocking {
        assertEquals(AlarmStatus.ACKNOWLEDGED, repository.acknowledgeAlarm("a1").getOrThrow().status)
        assertEquals(ArmingMode.ARMED_AWAY, repository.setArmingMode(ArmingMode.ARMED_AWAY).getOrThrow().mode)
        val ack = requests.first { it.path == "/api/v1/alarms/a1/acknowledge" }
        assertEquals("POST", ack.method)
        val arming = requests.first { it.path == "/api/v1/alarms/arming" }
        assertEquals("PUT", arming.method)
        assertEquals("""{"mode":"armed_away"}""", arming.body.readUtf8())
    }

    @Test
    fun `historia przekazuje filtry kategorii i dat`() = runBlocking {
        repository.events(EventQuery(EventCategory.CAMERA_OFFLINE, Instant.parse("2026-11-14T23:00:00Z"), Instant.parse("2026-11-15T22:59:59.999Z"), 50)).getOrThrow()
        val path = requests.last().requestUrl!!
        assertEquals("camera_offline", path.queryParameter("category"))
        assertEquals("2026-11-14T23:00:00Z", path.queryParameter("from"))
        assertEquals("2026-11-15T22:59:59.999Z", path.queryParameter("to"))
        assertEquals("50", path.queryParameter("limit"))
    }

    @Test
    fun `diagnostyka`() = runBlocking {
        val diagnostics = repository.diagnostics().getOrThrow()
        assertEquals("1.9.15", diagnostics.go2rtcVersion)
        assertEquals(1, diagnostics.devices.single().streamConsumers)
    }

    @Test
    fun `sygnalizacja WebRTC wysyla SDP i zwraca odpowiedz albo blad z kodem`() = runBlocking {
        assertEquals("v=0\r\nanswer\r\n", repository.exchangeOffer("c1", "v=0\r\noffer\r\n"))
        val offer = requests.first { it.path == "/api/v1/cameras/c1/webrtc" }
        assertTrue(offer.getHeader("Content-Type")!!.startsWith("application/sdp"))
        assertEquals("v=0\r\noffer\r\n", offer.body.readUtf8())

        val error = runCatching { repository.exchangeOffer("c2", "v=0") }.exceptionOrNull() as AppError.Server
        assertEquals(409, error.status)
        assertEquals("disabled", error.code)
    }
}
