package pl.sztudio.smarthome.presentation.diagnostics

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cable
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.MonitorHeart
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Storage
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.core.Formatters
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.model.DeviceDiagnostics
import pl.sztudio.smarthome.domain.model.Go2rtcState
import pl.sztudio.smarthome.domain.model.ServiceState
import pl.sztudio.smarthome.domain.model.StreamRegistration
import pl.sztudio.smarthome.domain.repository.ChannelState
import pl.sztudio.smarthome.domain.repository.RealtimeChannel
import pl.sztudio.smarthome.presentation.appViewModel
import pl.sztudio.smarthome.presentation.components.Badge
import pl.sztudio.smarthome.presentation.components.CardHeader
import pl.sztudio.smarthome.presentation.components.Divider
import pl.sztudio.smarthome.presentation.components.EmptyBlock
import pl.sztudio.smarthome.presentation.components.ErrorBlock
import pl.sztudio.smarthome.presentation.components.InfoRow
import pl.sztudio.smarthome.presentation.components.LoadingBlock
import pl.sztudio.smarthome.presentation.components.ScreenScaffold
import pl.sztudio.smarthome.presentation.components.SzCard
import pl.sztudio.smarthome.presentation.theme.Mono
import pl.sztudio.smarthome.presentation.theme.Sz
import pl.sztudio.smarthome.presentation.theme.Tone

@Composable
fun DiagnosticsScreen(onBack: () -> Unit) {
    val viewModel = appViewModel { DiagnosticsViewModel(it.monitoring, it.realtime, it.auth) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    DiagnosticsContent(state, onBack, viewModel::load, viewModel::runNow)
}

private val CHANNEL_LABELS = mapOf(
    RealtimeChannel.EVENTS to "Zdarzenia", RealtimeChannel.SYSTEM to "System",
    RealtimeChannel.CAMERAS to "Kamery", RealtimeChannel.ALARMS to "Alarmy",
)

@Composable
fun DiagnosticsContent(state: DiagnosticsUiState, onBack: () -> Unit, onReload: () -> Unit, onRun: () -> Unit) {
    ScreenScaffold("Diagnostyka", onBack = onBack, actions = { IconButton(onClick = onReload) { Icon(Icons.Outlined.Refresh, contentDescription = "Odśwież") } }) {
        LazyColumn(Modifier.fillMaxSize().testTag("diagnostics"), contentPadding = PaddingValues(Sz.gutter), verticalArrangement = Arrangement.spacedBy(Sz.gap)) {
            item {
                SzCard {
                    CardHeader("Sztudio Core", Icons.Outlined.Storage)
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                        val core = state.status.data
                        InfoRow("Stan", core?.state?.name?.lowercase() ?: "—", if (core == null) Sz.Muted else Sz.Ink)
                        InfoRow("Wersja", core?.version ?: "—")
                        InfoRow("Czas pracy", core?.let { Formatters.uptime(it.uptimeSeconds) } ?: "—")
                        core?.services?.forEach { service ->
                            InfoRow(service.name, when (service.state) { ServiceState.RUNNING -> "działa"; ServiceState.STOPPED -> "zatrzymana"; ServiceState.ERROR -> "błąd" },
                                when (service.state) { ServiceState.RUNNING -> Sz.Success; ServiceState.STOPPED -> Sz.Muted; ServiceState.ERROR -> Sz.Danger })
                        }
                        InfoRow("Czas odpowiedzi API (pomiar aplikacji)", state.averageResponseMs?.let { "śr. $it ms" } ?: "—")
                    }
                }
            }
            item {
                SzCard(Modifier.testTag("websocket")) {
                    CardHeader("WebSocket", Icons.Outlined.Cable)
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                        RealtimeChannel.entries.forEach { channel ->
                            val channelState = state.channels[channel] ?: ChannelState.IDLE
                            InfoRow(
                                CHANNEL_LABELS.getValue(channel),
                                when (channelState) { ChannelState.OPEN -> "połączony"; ChannelState.CONNECTING -> "łączenie"; ChannelState.RETRYING -> "ponawianie"; ChannelState.IDLE -> "nieaktywny" },
                                when (channelState) { ChannelState.OPEN -> Sz.Success; ChannelState.RETRYING -> Sz.Warning; else -> Sz.Muted },
                            )
                        }
                    }
                }
            }
            val diagnostics = state.diagnostics
            when {
                diagnostics.data == null && diagnostics.error != null -> item { SzCard { ErrorBlock(diagnostics.error, onReload) } }
                diagnostics.data == null -> item { LoadingBlock() }
                else -> {
                    val data = diagnostics.data
                    item {
                        SzCard {
                            CardHeader("go2rtc i monitor urządzeń", Icons.Outlined.MonitorHeart) {
                                if (state.canRun) OutlinedButton(onClick = onRun, enabled = !state.running) { Text(if (state.running) "Sprawdzanie…" else "Sprawdź teraz") }
                            }
                            Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                                InfoRow("go2rtc", when (data.go2rtcState) { Go2rtcState.RUNNING -> "działa"; Go2rtcState.ERROR -> "błąd"; Go2rtcState.NOT_CONFIGURED -> "nieskonfigurowany" },
                                    when (data.go2rtcState) { Go2rtcState.RUNNING -> Sz.Success; Go2rtcState.ERROR -> Sz.Danger; Go2rtcState.NOT_CONFIGURED -> Sz.Muted })
                                data.go2rtcVersion?.let { InfoRow("Wersja go2rtc", it) }
                                data.go2rtcStreams?.let { InfoRow("Zarejestrowane strumienie", it.toString()) }
                                data.go2rtcError?.let { Text(it, color = Sz.Danger, fontSize = 12.sp) }
                                InfoRow("Monitor", if (data.monitorEnabled) "co ${data.monitorIntervalSeconds} s" else "wyłączony")
                                InfoRow("Ostatnia kontrola", data.monitorLastRunAt?.let { Formatters.dateTime(it) } ?: "—")
                            }
                        }
                    }
                    item {
                        SzCard {
                            CardHeader("Połączenia z urządzeniami", Icons.Outlined.Videocam, data.devices.size.toString())
                            if (data.devices.isEmpty()) EmptyBlock("Brak urządzeń")
                            data.devices.forEachIndexed { index, device ->
                                if (index > 0) Divider()
                                DeviceRow(device)
                            }
                        }
                    }
                }
            }
            item {
                SzCard {
                    CardHeader("Ostatnie błędy aplikacji", Icons.Outlined.ErrorOutline, state.clientErrors.size.toString())
                    if (state.clientErrors.isEmpty()) {
                        EmptyBlock("Brak błędów", "Aplikacja nie zarejestrowała błędów połączenia.")
                    } else {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            state.clientErrors.take(10).forEach { error ->
                                Text("${Formatters.time(error.at)} · ${error.context}", color = Sz.Muted, fontSize = 12.sp)
                                Text(error.message, color = Sz.Silver, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceRow(device: DeviceDiagnostics) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(device.name, color = Sz.Ink, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            if (!device.enabled) Badge("Wyłączona", Tone.Neutral)
            else Badge(if (device.status == ConnectionStatus.ONLINE) "Online" else "Offline", if (device.status == ConnectionStatus.ONLINE) Tone.Success else Tone.Danger, dot = true)
        }
        Text(device.address ?: "brak adresu", style = Mono)
        Text(
            "Ostatnia próba: ${Formatters.relative(device.lastAttemptAt)} · udane połączenie: ${Formatters.relative(device.lastSuccessAt)}" +
                (device.responseTimeMs?.let { " · $it ms" } ?: ""),
            color = Sz.Muted, fontSize = 12.sp,
        )
        device.streamState?.let { stream ->
            Text("Strumień: " + when (stream) {
                StreamRegistration.REGISTERED -> "zarejestrowany" + (device.streamConsumers?.let { " · odbiorcy: $it" } ?: "")
                StreamRegistration.NOT_CONFIGURED -> "brak źródła"
                StreamRegistration.DISABLED -> "wyłączony"
                StreamRegistration.ERROR -> "błąd rejestracji"
                StreamRegistration.UNKNOWN -> "nieznany"
            }, color = Sz.Silver, fontSize = 12.sp)
        }
        if (device.errorCode != null) Text("${device.errorCode}: ${device.errorMessage.orEmpty()}", color = Sz.Danger, fontSize = 12.sp)
    }
}
