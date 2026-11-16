package pl.sztudio.smarthome.presentation.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.asAppError
import pl.sztudio.smarthome.domain.repository.AuthRepository
import pl.sztudio.smarthome.domain.usecase.LoginUseCase
import pl.sztudio.smarthome.domain.usecase.TestServerUseCase

data class LoginUiState(
    val server: String = "",
    val username: String = "",
    val password: String = "",
    val busy: Boolean = false,
    val testing: Boolean = false,
    /** Wynik testu adresu: czas odpowiedzi w ms. */
    val serverOkMs: Long? = null,
    val error: AppError? = null,
    /** Błąd danych wejściowych (np. adres http://). */
    val inputError: String? = null,
    val lockSeconds: Int = 0,
) {
    val canSubmit: Boolean get() = !busy && !testing && lockSeconds == 0 && server.isNotBlank() && username.isNotBlank() && password.isNotEmpty()
}

class LoginViewModel(
    private val login: LoginUseCase,
    private val testServer: TestServerUseCase,
    private val auth: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()
    private var countdown: Job? = null

    init {
        viewModelScope.launch {
            val last = auth.lastServerUrl.firstOrNull()
            if (!last.isNullOrBlank()) _state.update { if (it.server.isBlank()) it.copy(server = last) else it }
        }
        startCountdownIfLocked()
    }

    fun onServerChange(value: String) = _state.update { it.copy(server = value, serverOkMs = null, error = null, inputError = null) }
    fun onUsernameChange(value: String) = _state.update { it.copy(username = value, error = null) }
    fun onPasswordChange(value: String) = _state.update { it.copy(password = value, error = null) }

    fun testServer() {
        val server = _state.value.server
        _state.update { it.copy(testing = true, serverOkMs = null, error = null, inputError = null) }
        viewModelScope.launch {
            testServer(server)
                .onSuccess { ms -> _state.update { it.copy(testing = false, serverOkMs = ms) } }
                .onFailure { error -> _state.update { fail(it.copy(testing = false), error) } }
        }
    }

    fun submit() {
        val current = _state.value
        if (!current.canSubmit) return
        _state.update { it.copy(busy = true, error = null, inputError = null) }
        viewModelScope.launch {
            login(current.server, current.username, current.password)
                // Hasło nie jest przechowywane dłużej niż to konieczne.
                .onSuccess { _state.update { it.copy(busy = false, password = "") } }
                .onFailure { error ->
                    _state.update { fail(it.copy(busy = false), error) }
                    startCountdownIfLocked()
                }
        }
    }

    private fun fail(state: LoginUiState, error: Throwable): LoginUiState =
        if (error is AppError) state.copy(error = error) else state.copy(inputError = error.message ?: error.asAppError().userMessage)

    private fun startCountdownIfLocked() {
        if (auth.loginLockRemaining() == 0 || countdown?.isActive == true) return
        countdown = viewModelScope.launch {
            while (true) {
                val left = auth.loginLockRemaining()
                _state.update { it.copy(lockSeconds = left) }
                if (left == 0) break
                delay(1_000)
            }
        }
    }
}
