package pl.sztudio.smarthome.presentation.alarms

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.ShieldMoon
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import pl.sztudio.smarthome.core.Formatters
import pl.sztudio.smarthome.domain.model.ArmingMode
import pl.sztudio.smarthome.presentation.appViewModel
import pl.sztudio.smarthome.presentation.components.CardHeader
import pl.sztudio.smarthome.presentation.components.ConfirmDialog
import pl.sztudio.smarthome.presentation.components.Divider
import pl.sztudio.smarthome.presentation.components.EmptyBlock
import pl.sztudio.smarthome.presentation.components.ErrorBlock
import pl.sztudio.smarthome.presentation.components.LoadingBlock
import pl.sztudio.smarthome.presentation.components.ScreenScaffold
import pl.sztudio.smarthome.presentation.components.StaleBanner
import pl.sztudio.smarthome.presentation.components.SzCard
import pl.sztudio.smarthome.presentation.shared.AlarmRow
import pl.sztudio.smarthome.presentation.shared.armingLabel
import pl.sztudio.smarthome.presentation.theme.Sz

@Composable
fun AlarmsScreen() {
    val viewModel = appViewModel { AlarmsViewModel(it.monitoring, it.acknowledgeAlarm, it.setArmingMode, it.auth) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    AlarmsContent(state, viewModel::showHistory, viewModel::request, viewModel::confirm, viewModel::dismiss, viewModel::refresh, viewModel::clearMessage)
}

private val ARMING_DESCRIPTIONS = mapOf(
    ArmingMode.DISARMED to "Czujniki są monitorowane, ale nie wywołują alarmów włamaniowych.",
    ArmingMode.ARMED_HOME to "Chronione są drzwi, okna i strefy zewnętrzne. Ruch wewnątrz domu jest ignorowany.",
    ArmingMode.ARMED_AWAY to "Aktywne są wszystkie czujniki, również ruchu wewnątrz domu.",
)

@Composable
fun AlarmsContent(
    state: AlarmsUiState,
    onShowHistory: (Boolean) -> Unit,
    onRequest: (PendingAction) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    onRefresh: () -> Unit,
    onMessageShown: () -> Unit,
) {
    ScreenScaffold("Alarmy", actions = { IconButton(onClick = onRefresh) { Icon(Icons.Outlined.Refresh, contentDescription = "Odśwież") } }) {
        LazyColumn(Modifier.fillMaxSize().testTag("alarms"), contentPadding = PaddingValues(Sz.gutter), verticalArrangement = Arrangement.spacedBy(Sz.gap)) {
            if (state.alarms.isStale) item { StaleBanner(state.alarms.updatedAt, state.alarms.error) }
            item { ArmingCard(state, onRequest) }
            item {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    SegmentedButton(!state.showHistory, { onShowHistory(false) }, SegmentedButtonDefaults.itemShape(0, 2), label = { Text("Aktywne (${state.active.size})") })
                    SegmentedButton(state.showHistory, { onShowHistory(true) }, SegmentedButtonDefaults.itemShape(1, 2), label = { Text("Historia") })
                }
            }
            val alarms = if (state.showHistory) state.history else state.active
            when {
                state.alarms.data == null && state.alarms.error != null -> item { SzCard { ErrorBlock(state.alarms.error, onRefresh) } }
                state.alarms.data == null -> item { LoadingBlock() }
                alarms.isEmpty() -> item {
                    SzCard {
                        if (state.showHistory) {
                            EmptyBlock("Historia alarmów jest pusta", icon = Icons.Outlined.History)
                        } else {
                            EmptyBlock("Brak aktywnych alarmów", "Wszystkie alarmy zostały potwierdzone.", Icons.Outlined.VerifiedUser)
                        }
                    }
                }
                else -> item {
                    SzCard {
                        CardHeader(if (state.showHistory) "Historia alarmów" else "Aktywne alarmy", if (state.showHistory) Icons.Outlined.History else Icons.Outlined.NotificationsActive, alarms.size.toString())
                        alarms.forEachIndexed { index, alarm ->
                            if (index > 0) Divider()
                            AlarmRow(alarm) {
                                if (!state.showHistory && state.canControl) {
                                    Button(
                                        onClick = { onRequest(PendingAction.Acknowledge(alarm)) },
                                        enabled = state.busyId != alarm.id,
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                        modifier = Modifier.testTag("ack-${alarm.id}"),
                                    ) {
                                        Icon(Icons.Outlined.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Text(if (state.busyId == alarm.id) " …" else " Potwierdź", fontSize = 13.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (!state.canControl) {
                item { Text("Konto tylko do odczytu – potwierdzanie alarmów i zmiana trybu wymagają konta administratora.", color = Sz.Muted, fontSize = 12.sp) }
            }
        }
    }

    when (val pending = state.pending) {
        is PendingAction.Acknowledge -> ConfirmDialog(
            title = "Potwierdzić alarm?",
            message = "„${pending.alarm.title}” (${pending.alarm.sourceName}) zostanie oznaczony jako potwierdzony przez Ciebie.",
            confirmLabel = "Potwierdź alarm",
            onConfirm = onConfirm,
            onDismiss = onDismiss,
        )
        is PendingAction.Arm -> ConfirmDialog(
            title = if (pending.mode == ArmingMode.DISARMED) "Rozbroić system?" else "Zmienić tryb na „${armingLabel(pending.mode)}”?",
            message = ARMING_DESCRIPTIONS.getValue(pending.mode),
            confirmLabel = if (pending.mode == ArmingMode.DISARMED) "Rozbrój" else "Uzbrój",
            onConfirm = onConfirm,
            onDismiss = onDismiss,
            destructive = pending.mode == ArmingMode.DISARMED,
        )
        null -> Unit
    }

    state.message?.let { message ->
        LaunchedEffect(message) {
            delay(4_000)
            onMessageShown()
        }
        Column(Modifier.fillMaxSize().padding(Sz.gutter), verticalArrangement = Arrangement.Bottom) {
            Snackbar(containerColor = Sz.Raised, contentColor = Sz.Ink) { Text(message) }
        }
    }
}

@Composable
private fun ArmingCard(state: AlarmsUiState, onRequest: (PendingAction) -> Unit) {
    SzCard(Modifier.testTag("arming")) {
        CardHeader("Status uzbrojenia", Icons.Outlined.Shield)
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val arming = state.arming
            if (arming == null) {
                Text("Brak danych o stanie systemu.", color = Sz.Muted)
                return@Column
            }
            Text(armingLabel(arming.mode), color = Sz.Ink, fontSize = 18.sp, modifier = Modifier.testTag("arming-state"))
            Text("Od ${Formatters.dateTime(arming.changedAt)}" + (arming.changedBy?.let { " · $it" } ?: ""), color = Sz.Muted, fontSize = 12.sp)
            Text(ARMING_DESCRIPTIONS.getValue(arming.mode), color = Sz.Silver, fontSize = 13.sp)
            if (state.canControl) {
                ArmingMode.entries.forEach { mode ->
                    val selected = mode == arming.mode
                    val icon = when (mode) {
                        ArmingMode.DISARMED -> Icons.Outlined.ShieldMoon
                        ArmingMode.ARMED_HOME -> Icons.Outlined.Home
                        ArmingMode.ARMED_AWAY -> Icons.Outlined.Shield
                    }
                    OutlinedButton(
                        onClick = { onRequest(PendingAction.Arm(mode)) },
                        enabled = !selected && state.busyId != "arming",
                        modifier = Modifier.fillMaxWidth().testTag("arm-${mode.apiValue}"),
                        colors = if (selected) ButtonDefaults.outlinedButtonColors(containerColor = Sz.Blue.copy(alpha = 0.15f), disabledContainerColor = Sz.Blue.copy(alpha = 0.15f), disabledContentColor = Sz.Ink) else ButtonDefaults.outlinedButtonColors(),
                    ) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
                            Text(armingLabel(mode), modifier = Modifier.weight(1f))
                            if (selected) Text("aktywny", fontSize = 11.sp, color = Sz.BlueSoft)
                        }
                    }
                }
            }
        }
    }
}
