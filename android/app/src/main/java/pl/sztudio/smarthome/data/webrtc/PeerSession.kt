package pl.sztudio.smarthome.data.webrtc

import kotlinx.coroutines.flow.StateFlow
import org.webrtc.VideoSink

/** Stan połączenia WebRTC (odpowiednik `RTCPeerConnectionState`). */
enum class PeerState { NEW, CONNECTING, CONNECTED, DISCONNECTED, FAILED, CLOSED }

/** Jedna sesja odbioru obrazu z go2rtc. Implementacja natywna: [NativePeerSession]. */
interface PeerSession {
    val state: StateFlow<PeerState>

    /** Tworzy ofertę i zwraca pełne SDP z kandydatami ICE (backend nie obsługuje trickle ICE). */
    suspend fun createOffer(): String

    suspend fun setAnswer(sdp: String)

    /** Zamyka połączenie i zwalnia zasoby natywne. Wywołanie wielokrotne jest bezpieczne. */
    fun close()
}

fun interface PeerSessionFactory {
    fun create(sink: VideoSink): PeerSession
}
