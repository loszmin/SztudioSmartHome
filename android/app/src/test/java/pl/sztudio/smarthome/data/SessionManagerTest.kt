package pl.sztudio.smarthome.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.ServerUrl
import pl.sztudio.smarthome.data.api.ApiProvider
import pl.sztudio.smarthome.data.api.TokenProvider
import pl.sztudio.smarthome.data.auth.LoginThrottle
import pl.sztudio.smarthome.data.auth.SessionManager
import pl.sztudio.smarthome.data.auth.SessionStore
import pl.sztudio.smarthome.domain.model.Role
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.testutil.FakeCryptoBox
import pl.sztudio.smarthome.testutil.TlsFixture
import pl.sztudio.smarthome.testutil.baseUrl
import pl.sztudio.smarthome.testutil.json
import pl.sztudio.smarthome.testutil.loginJson
import pl.sztudio.smarthome.testutil.preferencesStore
import java.time.Instant
import java.util.concurrent.TimeUnit

/** Logowanie i sesja przez prawdziwy klient HTTPS (MockWebServer z lokalnym CA). */
class SessionManagerTest {
    @get:Rule val folder = TemporaryFolder()

    private val tls = TlsFixture()
    private lateinit var server: MockWebServer
    private lateinit var manager: SessionManager
    private lateinit var store: SessionStore
    private val crypto = FakeCryptoBox()
    private var now = Instant.parse("2026-11-15T12:00:00Z")
    private var loggedOutCallbacks = 0

    @Before
    fun setUp() {
        server = tls.server().apply { start() }
        store = SessionStore(preferencesStore(folder), crypto)
        lateinit var self: SessionManager
        val bridge = object : TokenProvider {
            override fun currentToken() = self.currentToken()
            override fun onUnauthorized() = self.onUnauthorized()
        }
        self = SessionManager(store, ApiProvider(tls.client(bridge)), LoginThrottle(maxFailures = 3, lockSeconds = 30), CoroutineScope(SupervisorJob() + Dispatchers.IO), { loggedOutCallbacks++ }, { now })
        manager = self
    }

    @After
    fun tearDown() = server.shutdown()

    private val url get() = ServerUrl.of(server.baseUrl())

    @Test
    fun `logowanie zapisuje zaszyfrowany token i ustawia aktywna sesje`() = runBlocking {
        server.enqueue(json(loginJson(token = "tajny-token-jwt", role = "viewer")))
        val session = manager.login(url, " admin ", "haslo").getOrThrow()

        val request = server.takeRequest()
        assertEquals("/api/v1/auth/login", request.path)
        assertEquals("""{"username":"admin","password":"haslo"}""", request.body.readUtf8())
        assertEquals(Role.VIEWER, session.role)
        assertEquals("tajny-token-jwt", manager.currentToken())
        assertTrue(manager.state.value is SessionState.Active)

        // Token na dysku jest zaszyfrowany; hasło nie jest zapisywane wcale.
        val raw = folder.root.walkTopDown().filter { it.isFile }.joinToString("") { it.readText(Charsets.ISO_8859_1) }
        assertFalse(raw.contains("tajny-token-jwt"))
        assertFalse(raw.contains("haslo"))
        assertEquals("tajny-token-jwt", store.load()?.token)
    }

    @Test
    fun `sesja jest odtwarzana po ponownym uruchomieniu, wygasla jest usuwana`() = runBlocking {
        server.enqueue(json(loginJson(expiresAt = "2026-11-16T12:00:00Z")))
        manager.login(url, "admin", "haslo").getOrThrow()

        val restored = SessionManager(store, ApiProvider(tls.client(manager)), LoginThrottle(), CoroutineScope(Dispatchers.IO), {}, { now })
        restored.restore()
        assertEquals("jwt-token", (restored.state.value as SessionState.Active).session.token)

        now = Instant.parse("2026-11-17T00:00:00Z")
        val expired = SessionManager(store, ApiProvider(tls.client(manager)), LoginThrottle(), CoroutineScope(Dispatchers.IO), {}, { now })
        expired.restore()
        assertEquals(SessionState.LoggedOut(AppError.SessionExpired), expired.state.value)
        assertNull(store.load())
    }

    @Test
    fun `bledne haslo, lokalna blokada po kolejnych probach i blokada serwera 429`() = runBlocking {
        repeat(3) { server.enqueue(json("""{"detail":"Nieprawidłowy login lub hasło."}""", 401)) }
        repeat(3) { assertTrue(manager.login(url, "admin", "zle").exceptionOrNull() is AppError.InvalidCredentials) }

        val locked = manager.login(url, "admin", "dobre").exceptionOrNull()
        assertTrue(locked is AppError.LoginLocked)
        assertEquals(3, server.requestCount) // czwarta próba nie została wysłana
        assertTrue(manager.loginLockRemaining() in 1..30)
    }

    @Test
    fun `blokada zgloszona przez serwer jest respektowana`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(429).setHeader("Retry-After", "45").setBody("""{"detail":"Zbyt wiele prób"}"""))
        val error = manager.login(url, "admin", "x").exceptionOrNull() as AppError.LoginLocked
        assertEquals(45, error.retryAfterSeconds)
        assertTrue(manager.loginLockRemaining() in 40..45)
    }

    @Test
    fun `odpowiedz 401 z API konczy sesje - token wygasl lub zostal uniewazniony`() = runBlocking {
        server.enqueue(json(loginJson()))
        manager.login(url, "admin", "haslo").getOrThrow()
        server.enqueue(json("""{"detail":"Wymagane uwierzytelnienie."}""", 401))

        assertEquals(AppError.SessionExpired, manager.validate().exceptionOrNull())
        val state = manager.state.first { it is SessionState.LoggedOut } as SessionState.LoggedOut
        assertEquals(AppError.SessionExpired, state.reason)
        assertNull(manager.currentToken())
        assertNull(store.load())
        assertEquals(1, loggedOutCallbacks)
        assertEquals("Bearer jwt-token", server.takeRequest(1, TimeUnit.SECONDS).let { server.takeRequest(1, TimeUnit.SECONDS) }?.getHeader("Authorization"))
    }

    @Test
    fun `token po terminie waznosci nie jest wysylany`() = runBlocking {
        server.enqueue(json(loginJson(expiresAt = "2026-11-15T13:00:00Z")))
        manager.login(url, "admin", "haslo").getOrThrow()
        now = Instant.parse("2026-11-15T13:00:01Z")
        assertNull(manager.currentToken())
        assertEquals(AppError.SessionExpired, manager.validate().exceptionOrNull())
    }

    @Test
    fun `wylogowanie usuwa sesje i zostawia adres serwera`() = runBlocking {
        server.enqueue(json(loginJson()))
        manager.login(url, "admin", "haslo").getOrThrow()
        manager.logout()
        assertEquals(SessionState.LoggedOut(null), manager.state.value)
        assertNull(store.load())
        assertEquals(url.value, store.lastServerUrl.first())
    }

    @Test
    fun `test serwera sprawdza dostepnosc i zaufanie do certyfikatu`() = runBlocking {
        server.enqueue(json("""{"status":"ok"}"""))
        assertTrue(manager.testServer(url).isSuccess)
        server.enqueue(json("{}", 503))
        assertTrue(manager.testServer(url).exceptionOrNull() is AppError.Server)
    }
}
