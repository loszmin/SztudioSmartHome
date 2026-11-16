package pl.sztudio.smarthome.domain.repository

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.core.ServerUrl
import pl.sztudio.smarthome.domain.model.Alarm
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

sealed interface SessionState {
    data object Loading : SessionState
    data class LoggedOut(val reason: AppError? = null) : SessionState
    data class Active(val session: Session) : SessionState
}

interface AuthRepository {
    val state: StateFlow<SessionState>

    /** Ostatnio użyty adres serwera (podpowiedź na ekranie logowania). */
    val lastServerUrl: Flow<String?>

    suspend fun restore()

    /** Sprawdza adres i zaufanie do certyfikatu (`GET /health`). */
    suspend fun testServer(url: ServerUrl): Result<Long>
    suspend fun login(url: ServerUrl, username: String, password: String): Result<Session>

    /** Potwierdza sesję na serwerze (`GET /auth/me`). */
    suspend fun validate(): Result<Unit>
    suspend fun logout(reason: AppError? = null)

    /** Sekundy do odblokowania logowania (0 = dozwolone). */
    fun loginLockRemaining(): Int
}

enum class RealtimeChannel(val path: String) { EVENTS("events"), SYSTEM("system"), CAMERAS("cameras"), ALARMS("alarms") }
enum class ChannelState { IDLE, CONNECTING, OPEN, RETRYING }

interface RealtimeRepository {
    val channels: StateFlow<Map<RealtimeChannel, ChannelState>>
}

/** Stan systemu pobierany z Core; aktualizowany przez WebSocket i odświeżanie. */
interface MonitoringRepository {
    val status: StateFlow<Loadable<CoreStatus>>
    val cameras: StateFlow<Loadable<List<Camera>>>
    val alarms: StateFlow<Loadable<List<Alarm>>>
    val sensors: StateFlow<Loadable<List<Sensor>>>
    val recentEvents: StateFlow<Loadable<List<SystemEvent>>>

    suspend fun refreshStatus()
    suspend fun refreshCameras()
    suspend fun refreshAlarms()
    suspend fun refreshSensors()
    suspend fun refreshRecentEvents()
    suspend fun refreshAll()

    suspend fun acknowledgeAlarm(id: String): Result<Alarm>
    suspend fun setArmingMode(mode: ArmingMode): Result<AlarmSystemState>
    suspend fun events(query: EventQuery): Result<List<SystemEvent>>
    suspend fun diagnostics(): Result<Diagnostics>
    suspend fun runDiagnostics(): Result<Diagnostics>

    /** Pomiary czasu odpowiedzi i błędy połączeń zarejestrowane przez aplikację. */
    val apiTimings: StateFlow<List<ApiTiming>>
    val clientErrors: StateFlow<List<ClientError>>

    suspend fun clear()
}

/** Sygnalizacja WebRTC przez Sztudio Core. */
fun interface StreamSignaling {
    /** Wysyła pełne SDP oferty i zwraca SDP odpowiedzi. */
    suspend fun exchangeOffer(cameraId: String, offerSdp: String): String
}

data class AppSettings(
    val defaultCameraLayout: Int = 4,
    val keepScreenOnDuringPreview: Boolean = true,
    val reduceMotion: Boolean = false,
)

interface SettingsRepository {
    val settings: Flow<AppSettings>
    suspend fun update(transform: (AppSettings) -> AppSettings)
}
