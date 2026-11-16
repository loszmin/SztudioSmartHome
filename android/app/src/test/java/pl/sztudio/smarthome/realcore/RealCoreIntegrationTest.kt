package pl.sztudio.smarthome.realcore

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.decodeCertificatePem
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.experimental.categories.Category
import org.junit.rules.TemporaryFolder
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.ServerUrl
import pl.sztudio.smarthome.data.api.ApiProvider
import pl.sztudio.smarthome.data.api.ErrorMapper
import pl.sztudio.smarthome.data.api.HttpClientFactory
import pl.sztudio.smarthome.data.api.TokenProvider
import pl.sztudio.smarthome.data.auth.LoginThrottle
import pl.sztudio.smarthome.data.auth.SessionManager
import pl.sztudio.smarthome.data.auth.SessionStore
import pl.sztudio.smarthome.data.local.SnapshotCache
import pl.sztudio.smarthome.data.repository.MonitoringRepositoryImpl
import pl.sztudio.smarthome.data.websocket.RealtimeClient
import pl.sztudio.smarthome.data.websocket.RealtimeMessage
import pl.sztudio.smarthome.domain.model.AlarmStatus
import pl.sztudio.smarthome.domain.model.ArmingMode
import pl.sztudio.smarthome.domain.repository.ChannelState
import pl.sztudio.smarthome.domain.repository.RealtimeChannel
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.testutil.FakeCryptoBox
import pl.sztudio.smarthome.testutil.preferencesStore
import java.io.File
import java.util.Properties
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Warstwa danych aplikacji (te same klasy co w APK) przeciw PRAWDZIWEMU Sztudio Core po HTTPS/WSS.
 *
 * Testy działają na JVM, nie na urządzeniu: Androidowy `network_security_config` (CA użytkownika) jest tu
 * zastąpiony jawnym zaufaniem do pliku `sztudio-ca.crt` – weryfikacja certyfikatu i nazwy hosta pozostaje włączona.
 * Podgląd WebRTC wymaga natywnej biblioteki Androida i nie jest tu sprawdzany.
 *
 * realcore.properties: url, username, password, caFile.
 */
@Category(RealCoreTest::class)
class RealCoreIntegrationTest {
    @get:Rule val folder = TemporaryFolder()

    private val config = Properties().apply {
        val file = File(System.getProperty("realcore.config", "realcore.properties"))
        assumeTrue("Brak realcore.properties – test z prawdziwym Core pominięty", file.exists())
        file.inputStream().use { load(it) }
    }
    private val url = ServerUrl.of(config.getProperty("url"))
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var manager: SessionManager
    private lateinit var client: OkHttpClient
    private lateinit var repository: MonitoringRepositoryImpl

    private fun clientFor(tokens: TokenProvider, trustCa: Boolean = true): OkHttpClient {
        // Bez lokalnego CA: tylko certyfikaty systemowe – jak telefon bez zainstalowanego certyfikatu Sztudio.
        val trust = HandshakeCertificates.Builder().addPlatformTrustedCertificates().apply {
            if (trustCa) addTrustedCertificate(File(config.getProperty("caFile")).readText().decodeCertificatePem())
        }.build()
        // Ruch do serwera w sieci lokalnej nie przechodzi przez proxy środowiska.
        return HttpClientFactory.create(tokens) { repository.recordTiming(it) }.newBuilder()
            .sslSocketFactory(trust.sslSocketFactory(), trust.trustManager)
            .proxy(java.net.Proxy.NO_PROXY)
            .build()
    }

    @Before
    fun setUp() {
        lateinit var self: SessionManager
        val bridge = object : TokenProvider {
            override fun currentToken() = self.currentToken()
            override fun onUnauthorized() = self.onUnauthorized()
        }
        client = clientFor(bridge)
        val apis = ApiProvider(client)
        self = SessionManager(SessionStore(preferencesStore(folder), FakeCryptoBox()), apis, LoginThrottle(), scope)
        manager = self
        repository = MonitoringRepositoryImpl(apis, { manager.session }, SnapshotCache(File(folder.root, "snapshot.bin"), FakeCryptoBox()), scope)
        runBlocking { manager.login(url, config.getProperty("username"), config.getProperty("password")).getOrThrow() }
    }

    @After
    fun tearDown() = runBlocking { manager.logout() }

    @Test
    fun `logowanie, sesja i weryfikacja tokenu na prawdziwym Core`() = runBlocking {
        val session = (manager.state.value as SessionState.Active).session
        assertEquals(config.getProperty("username"), session.username)
        assertTrue(session.expiresAt.isAfter(java.time.Instant.now()))
        assertTrue(manager.validate().isSuccess)
        assertTrue(manager.testServer(url).getOrThrow() >= 0)
    }

    @Test
    fun `bledne haslo jest odrzucane przez prawdziwy Core`() = runBlocking {
        val other = SessionManager(SessionStore(preferencesStore(folder, "other"), FakeCryptoBox()), ApiProvider(client), LoginThrottle(), scope)
        assertTrue(other.login(url, config.getProperty("username"), "zle-haslo-${System.nanoTime()}").exceptionOrNull() is AppError.InvalidCredentials)
    }

    @Test
    fun `dashboard pobiera prawdziwe dane`() = runBlocking {
        repository.refreshAll()
        listOf(repository.status, repository.cameras, repository.alarms, repository.sensors, repository.recentEvents).forEach {
            assertNotNull("brak danych: ${it.value.error?.userMessage}", it.value.data)
        }
        val status = repository.status.value.data!!
        println("Core ${status.version}, kamery: ${repository.cameras.value.data!!.size}, czujniki: ${repository.sensors.value.data!!.size}, alarmy aktywne: ${repository.alarms.value.data!!.count { it.status == AlarmStatus.ACTIVE }}")
        assertNotNull(repository.diagnostics().getOrThrow().go2rtcState)
    }

    @Test
    fun `WebSocket dostarcza aktualizacje - zmiana trybu uzbrojenia`() = runBlocking {
        val realtime = RealtimeClient(client, scope, onUnauthorized = {})
        val received = CopyOnWriteArrayList<RealtimeMessage>()
        val collector = launch(Dispatchers.IO) { realtime.messages.collect { received += it } }
        realtime.start(url, manager.session!!.token)
        withTimeout(15_000) { realtime.channels.first { map -> map.values.all { it == ChannelState.OPEN } } }

        repository.refreshStatus()
        val original = repository.status.value.data!!.alarmSystem.mode
        val target = if (original == ArmingMode.ARMED_AWAY) ArmingMode.ARMED_HOME else ArmingMode.ARMED_AWAY
        repository.setArmingMode(target).getOrThrow()
        withTimeout(10_000) { while (received.none { it.channel == RealtimeChannel.ALARMS && it.type == "arming.changed" }) delay(50) }
        withTimeout(10_000) { while (received.none { it.channel == RealtimeChannel.EVENTS && it.type == "event.created" }) delay(50) }
        assertEquals(target, repository.status.value.data!!.alarmSystem.mode)

        repository.setArmingMode(original).getOrThrow() // przywrócenie stanu domu
        collector.cancel()
        realtime.stop()
    }

    @Test
    fun `potwierdzanie alarmu na prawdziwym Core`() = runBlocking {
        repository.refreshAlarms()
        val active = repository.alarms.value.data!!.firstOrNull { it.status == AlarmStatus.ACTIVE }
        assumeTrue("Brak aktywnego alarmu do potwierdzenia", active != null)
        assertEquals(AlarmStatus.ACKNOWLEDGED, repository.acknowledgeAlarm(active!!.id).getOrThrow().status)
    }

    @Test
    fun `TLS - bez zaufania do lokalnego CA polaczenie jest odrzucane`() = runBlocking {
        val untrusted = clientFor(manager, trustCa = false)
        val error = runCatching { HttpClientFactory.retrofit(url.apiBase, untrusted).health() }.exceptionOrNull()!!
        assertEquals(AppError.UntrustedCertificate, ErrorMapper.fromThrowable(error))
    }

    @Test
    fun `sygnalizacja WebRTC - Core odrzuca nieprawidlowa oferte z kodem bledu`() = runBlocking {
        repository.refreshCameras()
        val camera = repository.cameras.value.data!!.firstOrNull()
        assumeTrue("Brak kamer w Core", camera != null)
        val error = runCatching { repository.exchangeOffer(camera!!.id, "to nie jest SDP") }.exceptionOrNull() as AppError.Server
        assertEquals(400, error.status)
        assertEquals("invalid_offer", error.code)
    }
}
