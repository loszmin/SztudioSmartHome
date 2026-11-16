package pl.sztudio.smarthome.presentation.alarms

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.domain.model.Alarm
import pl.sztudio.smarthome.domain.model.AlarmStatus
import pl.sztudio.smarthome.domain.model.AlarmSystemState
import pl.sztudio.smarthome.domain.model.ArmingMode
import pl.sztudio.smarthome.domain.model.Severity
import pl.sztudio.smarthome.domain.repository.AuthRepository
import pl.sztudio.smarthome.domain.repository.MonitoringRepository
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.domain.usecase.AcknowledgeAlarmUseCase
import pl.sztudio.smarthome.domain.usecase.SetArmingModeUseCase

/** Operacja czekająca na potwierdzenie użytkownika – nic nie zmienia stanu domu bez jego zgody. */
sealed interface PendingAction {
    data class Acknowledge(val alarm: Alarm) : PendingAction
    data class Arm(val mode: ArmingMode) : PendingAction
}

data class AlarmsUiState(
    val alarms: Loadable<List<Alarm>> = Loadable(),
    val arming: AlarmSystemState? = null,
    val canControl: Boolean = false,
    val showHistory: Boolean = false,
    val pending: PendingAction? = null,
    val busyId: String? = null,
    val message: String? = null,
) {
    private val sorted: List<Alarm> get() = alarms.data.orEmpty()
    val active: List<Alarm>
        get() = sorted.filter { it.status == AlarmStatus.ACTIVE }
            .sortedWith(compareBy<Alarm> { severityRank(it.severity) }.thenByDescending { it.triggeredAt })
    val history: List<Alarm> get() = sorted.filter { it.status != AlarmStatus.ACTIVE }.sortedByDescending { it.triggeredAt }

    companion object {
        fun severityRank(severity: Severity) = when (severity) {
            Severity.CRITICAL -> 0
            Severity.WARNING -> 1
            Severity.INFO -> 2
        }
    }
}

class AlarmsViewModel(
    private val repository: MonitoringRepository,
    private val acknowledge: AcknowledgeAlarmUseCase,
    private val setArming: SetArmingModeUseCase,
    auth: AuthRepository,
) : ViewModel() {
    private val ui = MutableStateFlow(AlarmsUiState())

    val state: StateFlow<AlarmsUiState> = combine(repository.alarms, repository.status, auth.state, ui) { alarms, status, session, local ->
        local.copy(
            alarms = alarms,
            arming = status.data?.alarmSystem,
            canControl = (session as? SessionState.Active)?.session?.canControl == true,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AlarmsUiState())

    fun showHistory(show: Boolean) = ui.update { it.copy(showHistory = show) }
    fun request(action: PendingAction) = ui.update { it.copy(pending = action, message = null) }
    fun dismiss() = ui.update { it.copy(pending = null) }
    fun clearMessage() = ui.update { it.copy(message = null) }

    fun refresh() {
        viewModelScope.launch {
            repository.refreshAlarms()
            repository.refreshStatus()
        }
    }

    /** Wykonuje operację wyłącznie po potwierdzeniu w oknie dialogowym. */
    fun confirm() {
        val action = ui.value.pending ?: return
        ui.update { it.copy(pending = null, busyId = action.key()) }
        viewModelScope.launch {
            val result = when (action) {
                is PendingAction.Acknowledge -> acknowledge(action.alarm).map { "Alarm „${it.title}” został potwierdzony." }
                is PendingAction.Arm -> setArming(action.mode).map { if (it.mode == ArmingMode.DISARMED) "System został rozbrojony." else "System został uzbrojony." }
            }
            ui.update {
                it.copy(
                    busyId = null,
                    message = result.fold({ ok -> ok }, { error -> (error as? pl.sztudio.smarthome.core.AppError)?.userMessage ?: "Operacja nie powiodła się." }),
                )
            }
        }
    }

    private fun PendingAction.key() = when (this) {
        is PendingAction.Acknowledge -> alarm.id
        is PendingAction.Arm -> "arming"
    }
}
