package pl.sztudio.smarthome.presentation.cameras

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.domain.model.Camera
import pl.sztudio.smarthome.domain.model.CoreService
import pl.sztudio.smarthome.domain.repository.MonitoringRepository
import pl.sztudio.smarthome.domain.repository.SettingsRepository

val CAMERA_LAYOUTS = listOf(1, 4, 6)

data class CamerasUiState(
    val cameras: Loadable<List<Camera>> = Loadable(),
    val layout: Int = 4,
    val page: Int = 0,
    val selectedId: String? = null,
    val go2rtc: CoreService? = null,
    val refreshing: Boolean = false,
) {
    private val list: List<Camera> get() = cameras.data.orEmpty()
    val pageCount: Int get() = maxOf(1, (list.size + layout - 1) / layout)
    val currentPage: Int get() = page.coerceIn(0, pageCount - 1)

    /** Kamery bieżącej strony – tylko dla nich zestawiane są strumienie. */
    val visible: List<Camera> get() = list.drop(currentPage * layout).take(layout)
    val selected: Camera? get() = list.firstOrNull { it.id == selectedId } ?: visible.firstOrNull()
}

class CamerasViewModel(
    private val repository: MonitoringRepository,
    private val settings: SettingsRepository,
    private val saved: SavedStateHandle,
) : ViewModel() {
    private val layout = MutableStateFlow(saved.get<Int>(KEY_LAYOUT) ?: 4)
    private val page = MutableStateFlow(saved.get<Int>(KEY_PAGE) ?: 0)
    private val selectedId = MutableStateFlow(saved.get<String>(KEY_SELECTED))
    private val refreshing = MutableStateFlow(false)

    init {
        if (saved.get<Int>(KEY_LAYOUT) == null) {
            viewModelScope.launch { setLayout(settings.settings.first().defaultCameraLayout) }
        }
    }

    val state: StateFlow<CamerasUiState> = combine(
        repository.cameras, repository.status, layout, page, combine(selectedId, refreshing) { a, b -> a to b },
    ) { cameras, status, layout, page, (selected, busy) ->
        CamerasUiState(cameras, layout, page, selected, status.data?.go2rtc, busy)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), CamerasUiState())

    fun setLayout(value: Int) {
        if (value !in CAMERA_LAYOUTS) return
        val list = state.value.cameras.data.orEmpty()
        val index = list.indexOfFirst { it.id == state.value.selected?.id }.coerceAtLeast(0)
        layout.value = value
        saved[KEY_LAYOUT] = value
        setPage(index / value)
    }

    fun setPage(value: Int) {
        page.value = value
        saved[KEY_PAGE] = value
    }

    fun select(id: String) {
        selectedId.value = id
        saved[KEY_SELECTED] = id
        val index = state.value.cameras.data.orEmpty().indexOfFirst { it.id == id }
        if (index >= 0) setPage(index / layout.value)
    }

    fun refresh() {
        viewModelScope.launch {
            refreshing.value = true
            repository.refreshCameras()
            repository.refreshStatus()
            refreshing.value = false
        }
    }

    private companion object {
        const val KEY_LAYOUT = "layout"
        const val KEY_PAGE = "page"
        const val KEY_SELECTED = "selected"
    }
}
