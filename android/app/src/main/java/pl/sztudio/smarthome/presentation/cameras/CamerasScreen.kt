package pl.sztudio.smarthome.presentation.cameras

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Fullscreen
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.createSavedStateHandle
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Box
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.core.Formatters
import pl.sztudio.smarthome.domain.model.Camera
import pl.sztudio.smarthome.domain.model.CameraSource
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.model.ServiceState
import pl.sztudio.smarthome.presentation.appViewModel
import pl.sztudio.smarthome.presentation.components.Badge
import pl.sztudio.smarthome.presentation.components.EmptyBlock
import pl.sztudio.smarthome.presentation.components.ErrorBlock
import pl.sztudio.smarthome.presentation.components.LoadingBlock
import pl.sztudio.smarthome.presentation.components.ScreenScaffold
import pl.sztudio.smarthome.presentation.components.StaleBanner
import pl.sztudio.smarthome.presentation.components.SzCard
import pl.sztudio.smarthome.presentation.theme.Sz
import pl.sztudio.smarthome.presentation.theme.Tone

@Composable
fun CamerasScreen(onOpenFullscreen: (String) -> Unit) {
    val viewModel = appViewModel { deps ->
        CamerasViewModel(deps.monitoring, deps.settings, createSavedStateHandle())
    }
    val state by viewModel.state.collectAsStateWithLifecycle()
    CamerasContent(state, viewModel::setLayout, viewModel::setPage, viewModel::select, viewModel::refresh, onOpenFullscreen)
}

@Composable
fun CamerasContent(
    state: CamerasUiState,
    onLayout: (Int) -> Unit,
    onPage: (Int) -> Unit,
    onSelect: (String) -> Unit,
    onRefresh: () -> Unit,
    onOpenFullscreen: (String) -> Unit,
) {
    ScreenScaffold(
        title = "Kamery",
        actions = {
            state.go2rtc?.let { Go2rtcBadge(it.state) }
            IconButton(onClick = onRefresh) { Icon(Icons.Outlined.Refresh, contentDescription = "Odśwież") }
        },
    ) {
        val cameras = state.cameras
        when {
            cameras.data == null && cameras.error != null -> ErrorBlock(cameras.error, onRefresh)
            cameras.data == null -> LoadingBlock()
            cameras.data.isEmpty() -> EmptyBlock("Brak kamer", "Kamery dodaje się w panelu WWW: Kamery → Dodaj kamerę.", Icons.Outlined.Videocam)
            else -> Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Sz.gutter, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(Sz.gap),
            ) {
                if (cameras.isStale) StaleBanner(cameras.updatedAt, cameras.error)
                Toolbar(state, onLayout, onPage, onSelect)
                Grid(state, onSelect, onOpenFullscreen)
                state.selected?.let { Details(it, onOpenFullscreen) }
            }
        }
    }
}

@Composable
private fun Go2rtcBadge(service: ServiceState) {
    val (tone, text) = when (service) {
        ServiceState.RUNNING -> Tone.Success to "go2rtc"
        ServiceState.ERROR -> Tone.Danger to "go2rtc: błąd"
        ServiceState.STOPPED -> Tone.Neutral to "go2rtc: wyłączony"
    }
    Badge(text, tone, dot = true)
}

@Composable
private fun Toolbar(state: CamerasUiState, onLayout: (Int) -> Unit, onPage: (Int) -> Unit, onSelect: (String) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SingleChoiceSegmentedButtonRow(Modifier.testTag("layout-selector")) {
            CAMERA_LAYOUTS.forEachIndexed { index, value ->
                SegmentedButton(
                    selected = state.layout == value,
                    onClick = { onLayout(value) },
                    shape = SegmentedButtonDefaults.itemShape(index, CAMERA_LAYOUTS.size),
                    label = { Text("$value") },
                    modifier = Modifier.testTag("layout-$value"),
                )
            }
        }
        CameraPicker(state, onSelect, Modifier.weight(1f))
    }
    if (state.pageCount > 1) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            IconButton(onClick = { onPage(state.currentPage - 1) }, enabled = state.currentPage > 0) {
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, contentDescription = if (state.layout == 1) "Poprzednia kamera" else "Poprzednia strona")
            }
            Text("${state.currentPage + 1} / ${state.pageCount}", color = Sz.Muted, fontSize = 13.sp, modifier = Modifier.testTag("page-indicator"))
            IconButton(onClick = { onPage(state.currentPage + 1) }, enabled = state.currentPage < state.pageCount - 1) {
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = if (state.layout == 1) "Następna kamera" else "Następna strona")
            }
        }
    }
}

@Composable
private fun CameraPicker(state: CamerasUiState, onSelect: (String) -> Unit, modifier: Modifier) {
    var open by remember { mutableStateOf(false) }
    Column(modifier) {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth().testTag("camera-picker")) {
            Text(state.selected?.name ?: "Wybierz kamerę", maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            state.cameras.data.orEmpty().forEach { camera ->
                DropdownMenuItem(
                    text = { Text(camera.name + if (camera.status == ConnectionStatus.OFFLINE) " (offline)" else "") },
                    onClick = {
                        open = false
                        onSelect(camera.id)
                    },
                )
            }
        }
    }
}

/** Siatka bieżącej strony: 1 kamera, 2×2 albo 2×3 (w poziomie 3×2). */
@Composable
private fun Grid(state: CamerasUiState, onSelect: (String) -> Unit, onOpenFullscreen: (String) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val wide = maxWidth > 600.dp
        val columns = when (state.layout) {
            1 -> 1
            4 -> 2
            else -> if (wide) 3 else 2
        }
        val slots: List<Camera?> = state.visible + List(state.layout - state.visible.size) { null }
        Column(
            Modifier.fillMaxWidth().widthIn(max = 1200.dp).testTag("camera-grid"),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            slots.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { camera ->
                        Column(Modifier.weight(1f)) {
                            if (camera != null) {
                                CameraTile(
                                    camera,
                                    selected = state.layout != 1 && camera.id == state.selected?.id,
                                    onClick = { if (state.layout == 1 || camera.id == state.selected?.id) onOpenFullscreen(camera.id) else onSelect(camera.id) },
                                )
                            } else {
                                // Wolny slot – układ zachowuje stałą siatkę także na ostatniej stronie.
                                Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).border(1.dp, Sz.Line, RoundedCornerShape(10.dp)))
                            }
                        }
                    }
                    repeat(columns - row.size) { Column(Modifier.weight(1f)) {} }
                }
            }
        }
    }
}

@Composable
private fun Details(camera: Camera, onOpenFullscreen: (String) -> Unit) {
    SzCard(Modifier.testTag("camera-details")) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(camera.name, color = Sz.Ink, fontSize = 15.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Badge(if (camera.status == ConnectionStatus.ONLINE) "Online" else "Offline", if (camera.status == ConnectionStatus.ONLINE) Tone.Success else Tone.Danger, dot = true)
                IconButton(onClick = { onOpenFullscreen(camera.id) }) { Icon(Icons.Outlined.Fullscreen, contentDescription = "Pełny ekran", tint = Sz.BlueSoft) }
            }
            Detail("Lokalizacja", camera.location.ifBlank { "—" })
            Detail("Jakość połączenia", camera.signalQuality?.let { "$it%" + (camera.responseTimeMs?.let { ms -> " · odpowiedź $ms ms" } ?: "") } ?: "—")
            Detail("Źródło obrazu", sourceLabel(camera.source) + (camera.channel?.let { " · kanał $it" } ?: "") + (camera.streamProfile?.let { " · profil $it" } ?: ""))
            Detail("Obraz", camera.resolution?.let { it + (camera.fps?.let { fps -> " · $fps kl./s" } ?: "") } ?: "—")
            Detail("Ostatnia aktywność", Formatters.relative(camera.lastSeenAt))
            if (camera.status == ConnectionStatus.OFFLINE && camera.errorMessage != null) {
                Text(camera.errorMessage + (camera.errorCode?.let { " (kod: $it)" } ?: ""), color = Sz.Danger, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun Detail(label: String, value: String) {
    Row {
        Text("$label: ", color = Sz.Muted, fontSize = 12.sp)
        Text(value, color = Sz.Silver, fontSize = 12.sp)
    }
}

fun sourceLabel(source: CameraSource) = when (source) {
    CameraSource.BCS -> "Rejestrator BCS"
    CameraSource.ONVIF -> "ONVIF"
    CameraSource.RTSP -> "RTSP"
    CameraSource.UNKNOWN -> "—"
}
