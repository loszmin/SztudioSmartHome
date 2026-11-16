package pl.sztudio.smarthome.presentation.cameras

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.ReportProblem
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material.icons.outlined.VideocamOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.core.Formatters
import pl.sztudio.smarthome.data.webrtc.CameraStreamController
import pl.sztudio.smarthome.data.webrtc.StreamState
import pl.sztudio.smarthome.domain.model.Camera
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.model.StreamRegistration
import pl.sztudio.smarthome.presentation.LocalAppDependencies
import pl.sztudio.smarthome.presentation.components.SignalBars
import pl.sztudio.smarthome.presentation.components.StatusDot
import pl.sztudio.smarthome.presentation.theme.Sz
import pl.sztudio.smarthome.presentation.theme.Tone

/** Stan kafla widoczny dla użytkownika (także w testach: `stateDescription`). */
fun tileStateLabel(camera: Camera, stream: StreamState?): String = when {
    !camera.enabled -> "wyłączona"
    camera.streamState == StreamRegistration.NOT_CONFIGURED -> "brak źródła"
    camera.status == ConnectionStatus.OFFLINE -> "offline"
    stream is StreamState.Playing -> "obraz"
    stream is StreamState.Reconnecting -> "ponawianie"
    stream is StreamState.Failed -> "błąd"
    else -> "łączenie"
}

/**
 * Kafel kamery. Strumień jest zestawiany wyłącznie, gdy kamera może nadawać ([Camera.canStream]);
 * kontroler jest pobierany z puli i oddawany, gdy kafel znika z ekranu.
 */
@Composable
fun CameraTile(
    camera: Camera,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    fill: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val shape = RoundedCornerShape(10.dp)
    var stream: StreamState? = null
    Box(
        modifier
            .then(if (fill) Modifier.fillMaxSize() else Modifier.fillMaxWidth().aspectRatio(16f / 9f))
            .clip(shape)
            .background(Color(0xFF060A13))
            .border(1.dp, if (selected) Sz.Blue else Sz.Line, shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .testTag("camera-${camera.id}"),
    ) {
        if (camera.canStream) {
            val streams = LocalAppDependencies.current.streams
            val controller = remember(camera.id) { streams.acquire(camera.id) }
            DisposableEffect(controller) { onDispose { streams.release(controller) } }
            val state by controller.state.collectAsStateWithLifecycle()
            stream = state
            LocalVideoRenderer.current.Render(controller, Modifier.fillMaxSize())
            if (state !is StreamState.Playing) StreamOverlay(state, controller)
        } else {
            Placeholder(camera)
        }
        TileChrome(camera, Modifier.semantics { stateDescription = tileStateLabel(camera, stream) })
    }
}

@Composable
private fun TileChrome(camera: Camera, modifier: Modifier) {
    val online = camera.status == ConnectionStatus.ONLINE
    Box(modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.7f), Color.Transparent))).padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            StatusDot(if (online) Tone.Success else Tone.Danger)
            Text(camera.name, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            SignalBars(camera.signalQuality)
        }
    }
}

@Composable
private fun Placeholder(camera: Camera) {
    val (icon, title, detail) = when {
        !camera.enabled -> Triple(Icons.Outlined.VideocamOff, "Kamera wyłączona", "Włącz kamerę w panelu WWW.")
        camera.streamState == StreamRegistration.NOT_CONFIGURED -> Triple(Icons.Outlined.Videocam, "Brak źródła obrazu", "Kamera nie ma skonfigurowanego strumienia RTSP.")
        camera.status == ConnectionStatus.OFFLINE -> Triple(
            Icons.Outlined.VideocamOff,
            "Kamera offline",
            camera.errorMessage ?: "Ostatnio widziana ${Formatters.relative(camera.lastSeenAt)}.",
        )
        else -> Triple(Icons.Outlined.ReportProblem, "Strumień niedostępny", "go2rtc nie ma zarejestrowanego strumienia tej kamery.")
    }
    CenteredMessage(icon, title, detail, tint = if (camera.status == ConnectionStatus.OFFLINE) Sz.Danger else Sz.Silver)
}

@Composable
private fun StreamOverlay(state: StreamState, controller: CameraStreamController) {
    when (state) {
        is StreamState.Connecting, StreamState.Idle -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CircularProgressIndicator(color = Sz.BlueSoft, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                Text("Łączenie z obrazem…", color = Sz.Silver, fontSize = 12.sp)
            }
        }
        is StreamState.Reconnecting -> CenteredMessage(
            Icons.Outlined.ReportProblem, "Brak obrazu", "${state.reason} Ponowienie za ${state.retryInSeconds} s.", Sz.Warning,
        ) { RetryButton(controller) }
        is StreamState.Failed -> CenteredMessage(Icons.Outlined.ReportProblem, "Brak obrazu", state.reason, Sz.Danger) { RetryButton(controller) }
        StreamState.Playing -> Unit
    }
}

@Composable
private fun RetryButton(controller: CameraStreamController) {
    OutlinedButton(onClick = controller::retryNow) {
        Icon(Icons.Outlined.Refresh, contentDescription = null, modifier = Modifier.size(14.dp))
        Text(" Połącz teraz", fontSize = 12.sp)
    }
}

@Composable
private fun CenteredMessage(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    detail: String,
    tint: Color,
    action: (@Composable () -> Unit)? = null,
) {
    BoxWithConstraints(Modifier.fillMaxSize().padding(12.dp), contentAlignment = Alignment.Center) {
        val compact = maxWidth < 220.dp
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = "$title. $detail" },
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(if (compact) 20.dp else 28.dp))
            Text(title, color = Sz.Silver, fontSize = if (compact) 11.sp else 13.sp, fontWeight = FontWeight.Medium)
            if (!compact) Text(detail, color = Sz.Muted, fontSize = 12.sp, textAlign = TextAlign.Center, maxLines = 3)
            if (!compact) action?.invoke()
        }
    }
}
