package pl.sztudio.smarthome.presentation.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.Formatters
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.core.asAppError
import pl.sztudio.smarthome.domain.model.Alarm
import pl.sztudio.smarthome.domain.model.EventCategory
import pl.sztudio.smarthome.domain.model.EventQuery
import pl.sztudio.smarthome.domain.model.SystemEvent
import pl.sztudio.smarthome.domain.repository.MonitoringRepository
import java.time.Instant
import java.time.LocalDate

enum class HistoryTab { EVENTS, ALARMS, FAILURES }

data class HistoryFilters(val category: EventCategory? = null, val from: LocalDate? = null, val to: LocalDate? = null) {
    val active: Boolean get() = category != null || from != null || to != null
    val invalidRange: Boolean get() = from != null && to != null && from.isAfter(to)

    /** Zakres dat w czasie lokalnym → zapytanie API (ISO 8601). */
    fun toQuery(): EventQuery = EventQuery(
        category = category,
        from = from?.takeUnless { invalidRange }?.atStartOfDay(Formatters.zone)?.toInstant(),
        to = to?.takeUnless { invalidRange }?.plusDays(1)?.atStartOfDay(Formatters.zone)?.toInstant()?.minusMillis(1),
    )

    fun includes(instant: Instant): Boolean {
        val query = toQuery()
        return (query.from == null || !instant.isBefore(query.from)) && (query.to == null || !instant.isAfter(query.to))
    }
}

data class HistoryUiState(
    val tab: HistoryTab = HistoryTab.EVENTS,
    val filters: HistoryFilters = HistoryFilters(),
    val events: Loadable<List<SystemEvent>> = Loadable(),
    val alarms: List<Alarm> = emptyList(),
) {
    val visibleAlarms: List<Alarm>
        get() = alarms.filter { filters.includes(it.triggeredAt) && (tab != HistoryTab.FAILURES || it.isFailure) }.sortedByDescending { it.triggeredAt }

    /** Awarie: alarmy techniczne (kamera, sieć, system) oraz zdarzenia utraty połączenia z kamerą. */
    val failureEvents: List<SystemEvent> get() = events.data.orEmpty().filter { it.category == EventCategory.CAMERA_OFFLINE }
}

class HistoryViewModel(private val repository: MonitoringRepository) : ViewModel() {
    private val tab = MutableStateFlow(HistoryTab.EVENTS)
    private val filters = MutableStateFlow(HistoryFilters())
    private val events = MutableStateFlow(Loadable<List<SystemEvent>>())
    private var loadJob: Job? = null

    val state: StateFlow<HistoryUiState> = combine(tab, filters, events, repository.alarms) { tab, filters, events, alarms ->
        HistoryUiState(tab, filters, events, alarms.data.orEmpty())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HistoryUiState())

    init {
        load()
        // Nowe zdarzenie z WebSocket odświeża listę ostatnich zdarzeń – wtedy przeładowujemy historię.
        viewModelScope.launch {
            repository.recentEvents.map { it.updatedAt }.distinctUntilChanged().drop(1).collect { load(silent = true) }
        }
    }

    fun setTab(value: HistoryTab) {
        tab.value = value
        if (value == HistoryTab.FAILURES && filters.value.category != null) setFilters(filters.value.copy(category = null))
    }

    fun setFilters(value: HistoryFilters) {
        filters.value = value
        load()
    }

    fun clearFilters() = setFilters(HistoryFilters())

    fun load(silent: Boolean = false) {
        loadJob?.cancel()
        if (!silent) events.update { it.loading() }
        val query = if (tab.value == HistoryTab.FAILURES) filters.value.toQuery().copy(category = EventCategory.CAMERA_OFFLINE) else filters.value.toQuery()
        loadJob = viewModelScope.launch {
            repository.events(query)
                .onSuccess { events.value = Loadable.success(it) }
                .onFailure { error -> events.update { it.copy(loading = false, error = error as? AppError ?: error.asAppError()) } }
        }
    }
}
