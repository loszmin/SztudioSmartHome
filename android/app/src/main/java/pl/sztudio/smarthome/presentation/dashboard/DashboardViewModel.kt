package pl.sztudio.smarthome.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.domain.repository.ChannelState
import pl.sztudio.smarthome.domain.repository.MonitoringRepository
import pl.sztudio.smarthome.domain.repository.RealtimeRepository
import pl.sztudio.smarthome.domain.usecase.DashboardSummary
import pl.sztudio.smarthome.domain.usecase.ObserveDashboardUseCase

enum class LiveState { LIVE, CONNECTING, OFFLINE }

data class DashboardUiState(val summary: DashboardSummary, val live: LiveState, val refreshing: Boolean)

class DashboardViewModel(
    observe: ObserveDashboardUseCase,
    private val repository: MonitoringRepository,
    realtime: RealtimeRepository,
) : ViewModel() {
    private val refreshing = MutableStateFlow(false)

    val state: StateFlow<DashboardUiState> = combine(observe(), realtime.channels, refreshing) { summary, channels, busy ->
        val live = when {
            channels.values.all { it == ChannelState.OPEN } -> LiveState.LIVE
            channels.values.any { it == ChannelState.CONNECTING } -> LiveState.CONNECTING
            else -> LiveState.OFFLINE
        }
        DashboardUiState(summary, live, busy)
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        DashboardUiState(ObserveDashboardUseCase.summarize(Loadable(), Loadable(), Loadable(), Loadable(), Loadable()), LiveState.CONNECTING, false),
    )

    fun refresh() {
        if (refreshing.value) return
        viewModelScope.launch {
            refreshing.value = true
            repository.refreshAll()
            refreshing.value = false
        }
    }
}
