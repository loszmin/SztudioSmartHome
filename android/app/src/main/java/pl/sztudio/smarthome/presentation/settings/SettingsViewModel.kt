package pl.sztudio.smarthome.presentation.settings

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
import pl.sztudio.smarthome.core.ServerUrl
import pl.sztudio.smarthome.domain.model.Session
import pl.sztudio.smarthome.domain.repository.AppSettings
import pl.sztudio.smarthome.domain.repository.AuthRepository
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.domain.repository.SettingsRepository

data class SettingsUiState(
    val session: Session? = null,
    val settings: AppSettings = AppSettings(),
    val testing: Boolean = false,
    val testResult: String? = null,
    val testOk: Boolean = false,
    val confirmLogout: Boolean = false,
)

class SettingsViewModel(private val auth: AuthRepository, private val settings: SettingsRepository) : ViewModel() {
    private val local = MutableStateFlow(SettingsUiState())

    val state: StateFlow<SettingsUiState> = combine(auth.state, settings.settings, local) { session, prefs, ui ->
        ui.copy(session = (session as? SessionState.Active)?.session, settings = prefs)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SettingsUiState())

    fun testConnection() {
        val server = state.value.session?.serverUrl ?: return
        local.update { it.copy(testing = true, testResult = null) }
        viewModelScope.launch {
            val health = auth.testServer(ServerUrl.of(server))
            val session = if (health.isSuccess) auth.validate() else health.map { }
            local.update {
                it.copy(
                    testing = false,
                    testOk = session.isSuccess,
                    testResult = session.fold(
                        { "Połączenie działa (${health.getOrNull()} ms), certyfikat zaufany, sesja ważna." },
                        { error -> (error as? AppError)?.userMessage ?: "Test nie powiódł się." },
                    ),
                )
            }
        }
    }

    fun updateSettings(transform: (AppSettings) -> AppSettings) {
        viewModelScope.launch { settings.update(transform) }
    }

    fun requestLogout(show: Boolean) = local.update { it.copy(confirmLogout = show) }

    fun logout() {
        local.update { it.copy(confirmLogout = false) }
        viewModelScope.launch { auth.logout() }
    }
}
