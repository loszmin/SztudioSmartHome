package pl.sztudio.smarthome.data.webrtc

import android.content.Context
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.VideoSink
import org.webrtc.VideoTrack
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Współdzielone zasoby WebRTC: fabryka połączeń i kontekst EGL dla rendererów.
 * Tworzone leniwie – dopiero przy pierwszym podglądzie kamery.
 */
class WebRtcEngine(private val context: Context) : PeerSessionFactory {
    val eglBase: EglBase by lazy { EglBase.create() }

    private val factory: PeerConnectionFactory by lazy {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions(),
        )
        PeerConnectionFactory.builder()
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, false, false))
            .createPeerConnectionFactory()
    }

    override fun create(sink: VideoSink): PeerSession = NativePeerSession(factory, sink)
}

/**
 * Sesja odbioru obrazu (tylko wideo, kierunek RECV_ONLY). Bez serwerów STUN/TURN – system działa w sieci lokalnej.
 */
class NativePeerSession(
    factory: PeerConnectionFactory,
    private val sink: VideoSink,
    private val iceGatheringTimeoutMs: Long = 2_000,
) : PeerSession {
    private val _state = MutableStateFlow(PeerState.NEW)
    override val state: StateFlow<PeerState> = _state.asStateFlow()

    private val gatheringComplete = CompletableDeferred<Unit>()
    @Volatile private var track: VideoTrack? = null
    @Volatile private var closed = false

    private val observer = object : PeerConnection.Observer {
        override fun onSignalingChange(state: PeerConnection.SignalingState?) = Unit
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) = Unit
        override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
            if (state == PeerConnection.IceGatheringState.COMPLETE) gatheringComplete.complete(Unit)
        }
        override fun onIceCandidate(candidate: IceCandidate?) = Unit
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
        override fun onAddStream(stream: MediaStream?) = Unit
        override fun onRemoveStream(stream: MediaStream?) = Unit
        override fun onDataChannel(channel: DataChannel?) = Unit
        override fun onRenegotiationNeeded() = Unit
        override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) = Unit

        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
            if (closed) return
            _state.value = when (newState) {
                PeerConnection.PeerConnectionState.CONNECTING -> PeerState.CONNECTING
                PeerConnection.PeerConnectionState.CONNECTED -> PeerState.CONNECTED
                PeerConnection.PeerConnectionState.DISCONNECTED -> PeerState.DISCONNECTED
                PeerConnection.PeerConnectionState.FAILED -> PeerState.FAILED
                PeerConnection.PeerConnectionState.CLOSED -> PeerState.CLOSED
                else -> PeerState.NEW
            }
        }

        override fun onTrack(transceiver: RtpTransceiver?) {
            val video = transceiver?.receiver?.track() as? VideoTrack ?: return
            if (closed) return
            track = video
            video.addSink(sink)
        }
    }

    private val connection: PeerConnection = factory.createPeerConnection(
        PeerConnection.RTCConfiguration(emptyList()).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE
        },
        observer,
    ) ?: error("Nie udało się utworzyć połączenia WebRTC.")

    init {
        connection.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY),
        )
    }

    override suspend fun createOffer(): String {
        val offer = suspendCancellableCoroutine { continuation ->
            connection.createOffer(object : SdpAdapter() {
                override fun onCreateSuccess(description: SessionDescription?) {
                    if (description != null) continuation.resume(description) else continuation.resumeWithException(IllegalStateException("Pusta oferta SDP"))
                }
                override fun onCreateFailure(error: String?) = continuation.resumeWithException(IllegalStateException(error ?: "Błąd tworzenia oferty"))
            }, MediaConstraints())
        }
        setDescription { observer -> connection.setLocalDescription(observer, offer) }
        // Backend przyjmuje jedną ofertę – czekamy na zebranie kandydatów ICE (maks. 2 s w sieci lokalnej).
        withTimeoutOrNull(iceGatheringTimeoutMs) { gatheringComplete.await() }
        return connection.localDescription?.description ?: offer.description
    }

    override suspend fun setAnswer(sdp: String) {
        setDescription { observer -> connection.setRemoteDescription(observer, SessionDescription(SessionDescription.Type.ANSWER, sdp)) }
    }

    private suspend fun setDescription(apply: (SdpObserver) -> Unit) = suspendCancellableCoroutine { continuation ->
        apply(object : SdpAdapter() {
            override fun onSetSuccess() = continuation.resume(Unit)
            override fun onSetFailure(error: String?) = continuation.resumeWithException(IllegalStateException(error ?: "Błąd SDP"))
        })
    }

    override fun close() {
        if (closed) return
        closed = true
        runCatching { track?.removeSink(sink) }
        track = null
        runCatching { connection.dispose() }
        _state.value = PeerState.CLOSED
    }

    private open class SdpAdapter : SdpObserver {
        override fun onCreateSuccess(description: SessionDescription?) = Unit
        override fun onSetSuccess() = Unit
        override fun onCreateFailure(error: String?) = Unit
        override fun onSetFailure(error: String?) = Unit
    }
}
