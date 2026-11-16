package pl.sztudio.smarthome.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.data.api.ErrorMapper
import pl.sztudio.smarthome.data.api.HttpClientFactory
import pl.sztudio.smarthome.testutil.TlsFixture
import pl.sztudio.smarthome.testutil.TokenHolder
import pl.sztudio.smarthome.testutil.baseUrl
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class ErrorMapperTest {
    @Test
    fun `szczegoly bledu z odpowiedzi Core`() {
        assertEquals("Brak", ErrorMapper.parseDetail("""{"detail":"Brak"}""").message)
        val structured = ErrorMapper.parseDetail("""{"detail":{"code":"go2rtc_unavailable","message":"Brak połączenia z usługą go2rtc."}}""")
        assertEquals("go2rtc_unavailable", structured.code)
        assertEquals("Brak połączenia z usługą go2rtc.", structured.message)
        assertEquals("validation", ErrorMapper.parseDetail("""{"detail":[{"loc":["body","mode"],"msg":"Input should be 'disarmed'"}]}""").code)
        assertEquals(null, ErrorMapper.parseDetail("<html>").message)
    }

    @Test
    fun `kody HTTP`() {
        assertEquals(AppError.SessionExpired, ErrorMapper.fromHttp(401, null))
        assertTrue(ErrorMapper.fromHttp(401, null, isLogin = true) is AppError.InvalidCredentials)
        assertTrue(ErrorMapper.fromHttp(403, """{"detail":"Operacja wymaga uprawnień administratora."}""") is AppError.Forbidden)
        val locked = ErrorMapper.fromHttp(429, null, retryAfter = "42") as AppError.LoginLocked
        assertEquals(42, locked.retryAfterSeconds)
        val server = ErrorMapper.fromHttp(502, """{"detail":{"code":"stream_unavailable","message":"go2rtc nie może otworzyć strumienia."}}""") as AppError.Server
        assertEquals("stream_unavailable", server.code)
        assertEquals("go2rtc nie może otworzyć strumienia.", server.userMessage)
    }

    @Test
    fun `bledy sieci`() {
        assertEquals(AppError.ServerNotFound, ErrorMapper.fromThrowable(UnknownHostException()))
        assertEquals(AppError.Unreachable, ErrorMapper.fromThrowable(ConnectException()))
        assertEquals(AppError.Timeout, ErrorMapper.fromThrowable(SocketTimeoutException()))
    }

    /** Prawdziwe uzgodnienie TLS: klient bez zainstalowanego CA odrzuca certyfikat serwera. */
    @Test
    fun `certyfikat niezaufany i niezgodna nazwa hosta sa rozpoznawane`() = runBlocking {
        val tls = TlsFixture()
        tls.server().use { server ->
            server.enqueue(MockResponse().setBody("{}"))
            val untrusted = tls.client(TokenHolder(), trustLocalCa = false)
            val error = runCatching { HttpClientFactory.retrofit(server.baseUrl() + "/", untrusted).health() }.exceptionOrNull()!!
            assertEquals(AppError.UntrustedCertificate, ErrorMapper.fromThrowable(error))
        }
        tls.server(certificateForOtherHost = true).use { server ->
            server.enqueue(MockResponse().setBody("{}"))
            val error = runCatching { HttpClientFactory.retrofit(server.baseUrl() + "/", tls.client(TokenHolder())).health() }.exceptionOrNull()!!
            assertEquals(AppError.CertificateHostMismatch, ErrorMapper.fromThrowable(error))
        }
    }
}
