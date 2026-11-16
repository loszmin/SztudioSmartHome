package pl.sztudio.smarthome.presentation.dashboard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Lan
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Sensors
import androidx.compose.material.icons.outlined.Storage
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.core.Formatters
import pl.sztudio.smarthome.domain.model.Camera
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.model.CoreState
import pl.sztudio.smarthome.presentation.appViewModel
import pl.sztudio.smarthome.presentation.components.Badge
import pl.sztudio.smarthome.presentation.components.CardHeader
import pl.sztudio.smarthome.presentation.components.Divider
import pl.sztudio.smarthome.presentation.components.EmptyBlock
import pl.sztudio.smarthome.presentation.components.ErrorBlock
import pl.sztudio.smarthome.presentation.components.MetricTile
import pl.sztudio.smarthome.presentation.components.ScreenScaffold
import pl.sztudio.smarthome.presentation.components.SignalBars
import pl.sztudio.smarthome.presentation.components.StaleBanner
import pl.sztudio.smarthome.presentation.components.StatusDot
import pl.sztudio.smarthome.presentation.components.SzCard
import pl.sztudio.smarthome.presentation.components.LoadingBlock
import pl.sztudio.smarthome.presentation.shared.AlarmRow
import pl.sztudio.smarthome.presentation.shared.EventRow
import pl.sztudio.smarthome.presentation.shared.armingLabel
import pl.sztudio.smarthome.presentation.theme.Sz
import pl.sztudio.smarthome.presentation.theme.Tone

@Composable
fun DashboardScreen(
    onOpenCameras: () -> Unit,
    onOpenCamera: (String) -> Unit,
    onOpenAlarms: () -> Unit,
    onOpenSensors: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenDiagnostics: () -> Unit,
    onShowCaHelp: () -> Unit,
) {
    val viewModel = appViewModel { DashboardViewModel(it.observeDashboard, it.monitoring, it.realtime) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    DashboardContent(state, viewModel::refresh, onOpenCameras, onOpenCamera, onOpenAlarms, onOpenSensors, onOpenHistory, onOpenDiagnostics, onShowCaHelp)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardContent(
    state: DashboardUiState,
    onRefresh: () -> Unit,
    onOpenCameras: () -> Unit,
    onOpenCamera: (String) -> Unit,
    onOpenAlarms: () -> Unit,
    onOpenSensors: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenDiagnostics: () -> Unit,
    onShowCaHelp: () -> Unit,
) {
    val summary = state.summary
    val status = summary.status
    ScreenScaffold(
        title = "Centrum monitoringu",
        actions = { LiveIndicator(state.live) },
    ) {
        PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
            LazyColumn(
                Modifier.fillMaxSize().testTag("dashboard"),
                contentPadding = PaddingValues(Sz.gutter),
                verticalArrangement = Arrangement.spacedBy(Sz.gap),
            ) {
                if (summary.isStale) item { StaleBanner(status.updatedAt ?: summary.status.updatedAt, summary.error) }

                if (status.data == null && status.error != null && summary.cameras.isEmpty()) {
                    item { SzCard { ErrorBlock(status.error, onRefresh, onShowCaHelp) } }
                    return@LazyColumn
                }
                if (status.isInitialLoading && summary.cameras.isEmpty()) {
                    item { LoadingBlock() }
                    return@LazyColumn
                }

                item {
                    val core = status.data
                    val (tone, label) = when {
                        core == null -> Tone.Neutral to "—"
                        status.isStale -> Tone.Warning to "Brak potwierdzenia"
                        core.state == CoreState.ONLINE -> Tone.Success to "Online"
                        core.state == CoreState.DEGRADED -> Tone.Warning to "Ograniczona praca"
                        else -> Tone.Danger to "Offline"
                    }
                    MetricTile(
                        Icons.Outlined.Storage, "Sztudio Core", label,
                        core?.let { "v${it.version} · ${Formatters.uptime(it.uptimeSeconds)}" + (it.go2rtc?.let { g -> " · go2rtc: ${g.state.name.lowercase()}" } ?: "") } ?: "Brak danych",
                        tone, Modifier.fillMaxWidth(), onOpenDiagnostics,
                    )
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(Sz.gap)) {
                        MetricTile(
                            Icons.Outlined.Videocam, "Kamery",
                            summary.camerasOnline?.let { "$it / ${summary.cameras.size}" },
                            when {
                                summary.cameras.isEmpty() && summary.camerasOnline != null -> "Brak kamer"
                                (summary.camerasOffline ?: 0) > 0 -> "${summary.camerasOffline} offline"
                                else -> "Wszystkie online"
                            },
                            if ((summary.camerasOffline ?: 0) > 0) Tone.Danger else Tone.Success,
                            Modifier.weight(1f), onOpenCameras,
                        )
                        val arming = status.data?.alarmSystem
                        MetricTile(
                            Icons.Outlined.Security, "Alarm",
                            arming?.let { armingLabel(it.mode) },
                            if (summary.activeAlarms.isEmpty()) "Brak aktywnych alarmów" else "Aktywne alarmy: ${summary.activeAlarms.size}",
                            when {
                                summary.hasCriticalAlarm -> Tone.Danger
                                summary.activeAlarms.isNotEmpty() -> Tone.Warning
                                else -> Tone.Success
                            },
                            Modifier.weight(1f), onOpenAlarms,
                        )
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(Sz.gap)) {
                        MetricTile(
                            Icons.Outlined.Sensors, "Czujniki", summary.sensorCount?.toString(),
                            when {
                                (summary.sensorsOffline ?: 0) > 0 -> "${summary.sensorsOffline} offline"
                                (summary.sensorsTriggered ?: 0) > 0 -> "Aktywne: ${summary.sensorsTriggered}"
                                else -> "Wszystkie w normie"
                            },
                            if ((summary.sensorsOffline ?: 0) > 0) Tone.Warning else Tone.Success,
                            Modifier.weight(1f), onOpenSensors,
                        )
                        MetricTile(
                            Icons.Outlined.Lan, "Połączenie",
                            when (state.live) {
                                LiveState.LIVE -> "Na żywo"
                                LiveState.CONNECTING -> "Łączenie…"
                                LiveState.OFFLINE -> "Brak"
                            },
                            if (state.live == LiveState.LIVE) "Aktualizacje w czasie rzeczywistym" else "Odświeżanie okresowe",
                            when (state.live) {
                                LiveState.LIVE -> Tone.Success
                                LiveState.CONNECTING -> Tone.Neutral
                                LiveState.OFFLINE -> Tone.Warning
                            },
                            Modifier.weight(1f), onOpenDiagnostics,
                        )
                    }
                }

                item { CameraStrip(summary.cameras, onOpenCamera, onOpenCameras) }

                item {
                    SzCard {
                        CardHeader("Aktywne alarmy", Icons.Outlined.NotificationsActive, summary.activeAlarms.size.toString()) {
                            TextButton(onClick = onOpenAlarms) { Text("Wszystkie") }
                        }
                        if (summary.activeAlarms.isEmpty()) {
                            EmptyBlock("Brak aktywnych alarmów", "System nie zgłasza żadnych zagrożeń.")
                        } else {
                            summary.activeAlarms.take(4).forEachIndexed { index, alarm ->
                                if (index > 0) Divider()
                                AlarmRow(alarm, compact = true)
                            }
                        }
                    }
                }
                item {
                    SzCard {
                        CardHeader("Ostatnie zdarzenia", Icons.Outlined.History) { TextButton(onClick = onOpenHistory) { Text("Historia") } }
                        if (summary.recentEvents.isEmpty()) {
                            EmptyBlock("Brak zdarzeń")
                        } else {
                            summary.recentEvents.forEachIndexed { index, event ->
                                if (index > 0) Divider()
                                EventRow(event, Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LiveIndicator(live: LiveState) {
    val (tone, text) = when (live) {
        LiveState.LIVE -> Tone.Success to "Na żywo"
        LiveState.CONNECTING -> Tone.Neutral to "Łączenie"
        LiveState.OFFLINE -> Tone.Warning to "Offline"
    }
    Badge(text, tone, dot = true, modifier = Modifier.testTag("live-indicator"))
}

/** Szybki dostęp do kamer – bez obrazu (podgląd otwiera się po wybraniu, by nie zestawiać zbędnych strumieni). */
@Composable
private fun CameraStrip(cameras: List<Camera>, onOpenCamera: (String) -> Unit, onOpenCameras: () -> Unit) {
    SzCard {
        CardHeader("Kamery", Icons.Outlined.Videocam, if (cameras.isEmpty()) null else "${cameras.count { it.status == ConnectionStatus.ONLINE }} z ${cameras.size} online") {
            TextButton(onClick = onOpenCameras) { Text("Monitoring") }
        }
        if (cameras.isEmpty()) {
            EmptyBlock("Brak kamer", "Kamery dodaje się w panelu WWW (Kamery → Dodaj kamerę).")
        } else {
            LazyRow(contentPadding = PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(cameras, key = { it.id }) { camera ->
                    SzCard(Modifier.width(168.dp), onClick = { onOpenCamera(camera.id) }) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                StatusDot(if (camera.status == ConnectionStatus.ONLINE) Tone.Success else Tone.Danger)
                                Text(camera.name, color = Sz.Ink, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            }
                            Text(camera.location.ifBlank { "—" }, fontSize = 12.sp, color = Sz.Muted, maxLines = 1)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                SignalBars(camera.signalQuality)
                                Spacer(Modifier.weight(1f))
                                Icon(Icons.AutoMirrored.Outlined.ArrowForward, contentDescription = "Otwórz podgląd", tint = Sz.BlueSoft, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}
