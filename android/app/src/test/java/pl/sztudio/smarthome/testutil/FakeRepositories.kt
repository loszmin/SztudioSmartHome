package pl.sztudio.smarthome.testutil

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.core.ServerUrl
import pl.sztudio.smarthome.domain.model.Alarm
import pl.sztudio.smarthome.domain.model.AlarmStatus
import pl.sztudio.smarthome.domain.model.AlarmSystemState
import pl.sztudio.smarthome.domain.model.ApiTiming
import pl.sztudio.smarthome.domain.model.ArmingMode
import pl.sztudio.smarthome.domain.model.Camera
import pl.sztudio.smarthome.domain.model.ClientError
import pl.sztudio.smarthome.domain.model.CoreStatus
import pl.sztudio.smarthome.domain.model.Diagnostics
import pl.sztudio.smarthome.domain.model.EventQuery
import pl.sztudio.smarthome.domain.model.Sensor
import pl.sztudio.smarthome.domain.model.Session
import pl.sztudio.smarthome.domain.model.SystemEvent
import pl.sztudio.smarthome.domain.repository.AppSettings
import pl.sztudio.smarthome.domain.repository.AuthRepository
import pl.sztudio.smarthome.domain.repository.ChannelState
import pl.sztudio.smarthome.domain.repository.MonitoringRepository
import pl.sztudio.smarthome.domain.repository.RealtimeChannel
import pl.sztudio.smarthome.domain.repository.RealtimeRepository
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.domain.repository.SettingsRepository
import java.time.Instant

/** Repozytorium w pamięci do testów ViewModeli i ekranów (bez sieci). */
class FakeMonitoring : MonitoringRepository {
    override val status = MutableStateFlow(Loadable<CoreStatus>())
    override val cameras = MutableStateFlow(Loadable<List<Camera>>())
    override val alarms = MutableStateFlow(Loadable<List<Alarm>>())
    override val sensors = MutableStateFlow(Loadable<List<Sensor>>())
    override val recentEvents = MutableStateFlow(Loadable<List<SystemEvent>>())
    override val apiTimings = MutableStateFlow<List<ApiTiming>>(emptyList())
    override val clientErrors = MutableStateFlow<List<ClientError>>(emptyList())

    val refreshCalls = mutableListOf<String>()
    val acknowledged = mutableListOf<String>()
    val armingChanges = mutableListOf<ArmingMode>()
    var eventsResult: Result<List<SystemEvent>> = Result.success(emptyList())
    val eventQueries = mutableListOf<EventQuery>()
    var diagnosticsResult: Result<Diagnostics> = Result.failure(AppError.Unreachable)
    var failNextAction: AppError? = null

    override suspend fun refreshStatus() { refreshCalls += "status" }
    override suspend fun refreshCameras() { refreshCalls += "cameras" }
    override suspend fun refreshAlarms() { refreshCalls += "alarms" }
    override suspend fun refreshSensors() { refreshCalls += "sensors" }
    override suspend fun refreshRecentEvents() { refreshCalls += "events" }
    override suspend fun refreshAll() { refreshCalls += "all" }

    override suspend fun acknowledgeAlarm(id: String): Result<Alarm> {
        failNextAction?.let { failNextAction = null; return Result.failure(it) }
        acknowledged += id
        val alarm = alarms.value.data.orEmpty().first { it.id == id }.copy(status = AlarmStatus.ACKNOWLEDGED)
        alarms.value = Loadable.success(alarms.value.data.orEmpty().map { if (it.id == id) alarm else it })
        return Result.success(alarm)
    }

    override suspend fun setArmingMode(mode: ArmingMode): Result<AlarmSystemState> {
        failNextAction?.let { failNextAction = null; return Result.failure(it) }
        armingChanges += mode
        val state = AlarmSystemState(mode, Instant.now(), "admin")
        status.value.data?.let { status.value = Loadable.success(it.copy(alarmSystem = state)) }
        return Result.success(state)
    }

    override suspend fun events(query: EventQuery): Result<List<SystemEvent>> {
        eventQueries += query
        return eventsResult
    }

    override suspend fun diagnostics() = diagnosticsResult
    override suspend fun runDiagnostics() = diagnosticsResult
    override suspend fun clear() = Unit
}

class FakeAuth(initial: SessionState = SessionState.Active(session())) : AuthRepository {
    override val state = MutableStateFlow(initial)
    override val lastServerUrl: Flow<String?> = MutableStateFlow("https://192.168.1.10")
    var loginResult: Result<Session> = Result.success(session())
    var lockSeconds = 0
    val logins = mutableListOf<Triple<String, String, String>>()
    var loggedOut = false

    override suspend fun restore() = Unit
    override suspend fun testServer(url: ServerUrl): Result<Long> = Result.success(12)
    override suspend fun login(url: ServerUrl, username: String, password: String): Result<Session> {
        logins += Triple(url.value, username, password)
        return loginResult.onSuccess { state.value = SessionState.Active(it) }
    }
    override suspend fun validate(): Result<Unit> = Result.success(Unit)
    override suspend fun logout(reason: AppError?) {
        loggedOut = true
        state.value = SessionState.LoggedOut(reason)
    }
    override fun loginLockRemaining() = lockSeconds
}

class FakeRealtime(open: Boolean = true) : RealtimeRepository {
    override val channels: StateFlow<Map<RealtimeChannel, ChannelState>> =
        MutableStateFlow(RealtimeChannel.entries.associateWith { if (open) ChannelState.OPEN else ChannelState.RETRYING })
}

class FakeSettings : SettingsRepository {
    override val settings = MutableStateFlow(AppSettings())
    override suspend fun update(transform: (AppSettings) -> AppSettings) {
        settings.value = transform(settings.value)
    }
}
