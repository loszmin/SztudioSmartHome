package pl.sztudio.smarthome.presentation.diagnostics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.core.asAppError
import pl.sztudio.smarthome.domain.model.ApiTiming
import pl.sztudio.smarthome.domain.model.ClientError
import pl.sztudio.smarthome.domain.model.CoreStatus
import pl.sztudio.smarthome.domain.model.Diagnostics
import pl.sztudio.smarthome.domain.repository.AuthRepository
import pl.sztudio.smarthome.domain.repository.ChannelState
import pl.sztudio.smarthome.domain.repository.MonitoringRepository
import pl.sztudio.smarthome.domain.repository.RealtimeChannel
import pl.sztudio.smarthome.domain.repository.RealtimeRepository
import pl.sztudio.smarthome.domain.repository.SessionState

data class DiagnosticsUiState(
    val diagnostics: Loadable<Diagnostics> = Loadable(),
    val status: Loadable<CoreStatus> = Loadable(),
    val channels: Map<RealtimeChannel, ChannelState> = emptyMap(),
    val timings: List<ApiTiming> = emptyList(),
    val clientErrors: List<ClientError> = emptyList(),
    val canRun: Boolean = false,
    val running: Boolean = false,
) {
    /** Średni czas odpowiedzi udanych żądań (pomiar aplikacji). */
    val averageResponseMs: Long? get() = timings.filter { it.status in 200..299 }.takeIf { it.isNotEmpty() }?.map { it.durationMs }?.average()?.toLong()
}

class DiagnosticsViewModel(
    private val repository: MonitoringRepository,
    realtime: RealtimeRepository,
    auth: AuthRepository,
) : ViewModel() {
    private val diagnostics = MutableStateFlow(Loadable<Diagnostics>())
    private val running = MutableStateFlow(false)

    val state: StateFlow<DiagnosticsUiState> = combine(
        combine(diagnostics, repository.status, ::Pair),
        realtime.channels,
        combine(repository.apiTimings, repository.clientErrors, ::Pair),
        auth.state,
        running,
    ) { (diag, status), channels, (timings, errors), session, busy ->
        DiagnosticsUiState(diag, status, channels, timings, errors, (session as? SessionState.Active)?.session?.canControl == true, busy)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DiagnosticsUiState())

    init {
        load()
    }

    fun load() {
        diagnostics.update { it.loading() }
        viewModelScope.launch {
            repository.diagnostics()
                .onSuccess { diagnostics.value = Loadable.success(it) }
                .onFailure { error -> diagnostics.update { it.copy(loading = false, error = error as? AppError ?: error.asAppError()) } }
        }
    }

    /** Natychmiastowa kontrola wszystkich urządzeń (`POST /diagnostics/run`, rola admin). */
    fun runNow() {
        if (running.value) return
        running.value = true
        viewModelScope.launch {
            repository.runDiagnostics()
                .onSuccess { diagnostics.value = Loadable.success(it) }
                .onFailure { error -> diagnostics.update { it.copy(error = error as? AppError ?: error.asAppError()) } }
            repository.refreshCameras()
            running.value = false
        }
    }
}
