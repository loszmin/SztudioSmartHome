package pl.sztudio.smarthome.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerUrlTest {
    @Test
    fun `adres bez schematu otrzymuje https i jest normalizowany`() {
        assertEquals("https://192.168.1.10", ServerUrl.of("192.168.1.10").value)
        assertEquals("https://sztudio.lan:8443", ServerUrl.of("  HTTPS://Sztudio.LAN:8443/ ").value)
        assertEquals("https://sztudio.lan", ServerUrl.of("https://sztudio.lan:443").value)
        assertEquals("https://192.168.1.10/", ServerUrl.of("https://192.168.1.10").apiBase)
    }

    @Test
    fun `adres WebSocket uzywa wss`() {
        assertEquals("wss://192.168.1.10:8443/ws/v1/events?token=x", ServerUrl.of("https://192.168.1.10:8443").webSocket("/ws/v1/events?token=x"))
    }

    @Test
    fun `http i inne schematy sa odrzucane - aplikacja nie laczy sie bez szyfrowania`() {
        assertEquals(AppError.CleartextNotAllowed, ServerUrl.parse("http://192.168.1.10").exceptionOrNull())
        assertEquals(AppError.CleartextNotAllowed, ServerUrl.parse("ftp://192.168.1.10").exceptionOrNull())
    }

    @Test
    fun `adresy nieprawidlowe sa odrzucane`() {
        listOf("", "   ", "https://", "https://host/?a=1", "https://user:pass@host", "https://host#x", "https://host:70000").forEach {
            assertTrue(it, ServerUrl.parse(it).isFailure)
        }
    }
}
