package pl.sztudio.smarthome.data.auth

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.ServerUrl
import pl.sztudio.smarthome.data.api.ApiProvider
import pl.sztudio.smarthome.data.api.ErrorMapper
import pl.sztudio.smarthome.data.api.LoginRequestDto
import pl.sztudio.smarthome.data.api.TokenProvider
import pl.sztudio.smarthome.data.api.parseInstant
import pl.sztudio.smarthome.data.api.role
import pl.sztudio.smarthome.domain.model.Session
import pl.sztudio.smarthome.domain.repository.AuthRepository
import pl.sztudio.smarthome.domain.repository.SessionState
import java.time.Instant

/**
 * Sesja użytkownika. Backend wydaje token JWT ważny do `expiresAt` i nie ma mechanizmu odświeżania –
 * po wygaśnięciu (lub odrzuceniu tokenu przez serwer) aplikacja wraca do ekranu logowania.
 */
class SessionManager(
    private val store: SessionStore,
    private val apis: ApiProvider,
    private val throttle: LoginThrottle,
    private val scope: CoroutineScope,
    private val onLoggedOut: suspend () -> Unit = {},
    private val now: () -> Instant = Instant::now,
) : AuthRepository, TokenProvider {

    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    override val state: StateFlow<SessionState> = _state.asStateFlow()
    override val lastServerUrl: Flow<String?> = store.lastServerUrl

    @Volatile private var current: Session? = null
    private val mutex = Mutex()

    val session: Session? get() = current

    override fun currentToken(): String? = current?.takeUnless { it.isExpired(now()) }?.token

    override fun onUnauthorized() {
        if (current != null) scope.launch { logout(AppError.SessionExpired) }
    }

    override suspend fun restore() {
        val saved = store.load()
        when {
            saved == null -> _state.value = SessionState.LoggedOut()
            saved.isExpired(now()) -> {
                store.clear()
                _state.value = SessionState.LoggedOut(AppError.SessionExpired)
            }
            else -> {
                current = saved
                _state.value = SessionState.Active(saved)
            }
        }
    }

    override suspend fun testServer(url: ServerUrl): Result<Long> = runCatching {
        val started = System.nanoTime()
        apis.forServer(url.value).health()
        (System.nanoTime() - started) / 1_000_000
    }.recoverCatching { throw ErrorMapper.fromThrowable(it) }

    override suspend fun login(url: ServerUrl, username: String, password: String): Result<Session> = mutex.withLock {
        val locked = throttle.remainingSeconds()
        if (locked > 0) return Result.failure(AppError.LoginLocked(locked))
        if (username.isBlank() || password.isEmpty()) return Result.failure(AppError.InvalidCredentials("Podaj login i hasło."))

        runCatching { apis.forServer(url.value).login(LoginRequestDto(username.trim(), password)) }
            .map { response ->
                Session(
                    serverUrl = url.value,
                    token = response.accessToken,
                    username = response.user.username,
                    role = role(response.user.role),
                    expiresAt = parseInstant(response.expiresAt) ?: throw AppError.Protocol(),
                )
            }
            .onSuccess { session ->
                throttle.reset()
                store.save(session)
                current = session
                _state.value = SessionState.Active(session)
            }
            .recoverCatching { error ->
                val mapped = ErrorMapper.fromThrowable(error, isLogin = true)
                when (mapped) {
                    is AppError.InvalidCredentials -> throttle.recordFailure()
                    is AppError.LoginLocked -> throttle.lockFor(mapped.retryAfterSeconds)
                    else -> Unit
                }
                throw mapped
            }
    }

    override suspend fun validate(): Result<Unit> {
        val session = current ?: return Result.failure(AppError.SessionExpired)
        if (session.isExpired(now())) {
            logout(AppError.SessionExpired)
            return Result.failure(AppError.SessionExpired)
        }
        return runCatching { apis.forServer(session.serverUrl).me(); Unit }
            .recoverCatching { throw ErrorMapper.fromThrowable(it) }
            .onFailure { if (it is AppError.SessionExpired) logout(AppError.SessionExpired) }
    }

    private val logoutMutex = Mutex()

    /** Idempotentne: równoczesne odrzucenia tokenu (REST i WebSocket) kończą sesję tylko raz. */
    override suspend fun logout(reason: AppError?) = logoutMutex.withLock {
        if (current == null && _state.value is SessionState.LoggedOut) return@withLock
        current = null
        store.clear()
        onLoggedOut()
        _state.value = SessionState.LoggedOut(reason)
    }

    override fun loginLockRemaining(): Int = throttle.remainingSeconds()
}
