package pl.sztudio.smarthome.presentation.sensors

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.domain.model.Sensor
import pl.sztudio.smarthome.domain.model.SensorType
import pl.sztudio.smarthome.domain.repository.MonitoringRepository

data class SensorsUiState(val sensors: Loadable<List<Sensor>> = Loadable(), val filter: SensorType? = null) {
    val groups: List<Pair<SensorType, List<Sensor>>>
        get() = SensorType.entries
            .filter { filter == null || it == filter }
            .map { type -> type to sensors.data.orEmpty().filter { it.type == type }.sortedBy { it.name } }
            .filter { it.second.isNotEmpty() }

    /** Typy obecne w danych – filtr nie proponuje kategorii, których backend nie zwrócił. */
    val availableTypes: List<SensorType> get() = SensorType.entries.filter { type -> sensors.data.orEmpty().any { it.type == type } }
}

class SensorsViewModel(private val repository: MonitoringRepository) : ViewModel() {
    private val filter = MutableStateFlow<SensorType?>(null)
    val state: StateFlow<SensorsUiState> = combine(repository.sensors, filter, ::SensorsUiState)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SensorsUiState())

    fun setFilter(type: SensorType?) {
        filter.value = type
    }

    fun refresh() {
        viewModelScope.launch { repository.refreshSensors() }
    }
}
