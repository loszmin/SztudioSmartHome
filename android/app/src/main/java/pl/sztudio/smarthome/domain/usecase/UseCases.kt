package pl.sztudio.smarthome.domain.usecase

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.core.ServerUrl
import pl.sztudio.smarthome.domain.model.Alarm
import pl.sztudio.smarthome.domain.model.AlarmStatus
import pl.sztudio.smarthome.domain.model.AlarmSystemState
import pl.sztudio.smarthome.domain.model.ArmingMode
import pl.sztudio.smarthome.domain.model.Camera
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.model.CoreStatus
import pl.sztudio.smarthome.domain.model.Sensor
import pl.sztudio.smarthome.domain.model.Session
import pl.sztudio.smarthome.domain.model.Severity
import pl.sztudio.smarthome.domain.model.SystemEvent
import pl.sztudio.smarthome.domain.repository.AuthRepository
import pl.sztudio.smarthome.domain.repository.MonitoringRepository

class LoginUseCase(private val auth: AuthRepository) {
    suspend operator fun invoke(serverInput: String, username: String, password: String): Result<Session> {
        val url = ServerUrl.parse(serverInput).getOrElse { return Result.failure(it) }
        if (username.isBlank()) return Result.failure(AppError.InvalidCredentials("Podaj login."))
        if (password.isEmpty()) return Result.failure(AppError.InvalidCredentials("Podaj hasło."))
        return auth.login(url, username, password)
    }
}

class TestServerUseCase(private val auth: AuthRepository) {
    suspend operator fun invoke(serverInput: String): Result<Long> {
        val url = ServerUrl.parse(serverInput).getOrElse { return Result.failure(it) }
        return auth.testServer(url)
    }
}

/** Operacje zmieniające stan zabezpieczeń – wyłącznie dla roli `admin` (backend i tak to wymusza). */
class AcknowledgeAlarmUseCase(private val repository: MonitoringRepository, private val session: () -> Session?) {
    suspend operator fun invoke(alarm: Alarm): Result<Alarm> {
        if (session()?.canControl != true) return Result.failure(AppError.Forbidden("Potwierdzanie alarmów wymaga konta administratora."))
        if (alarm.status != AlarmStatus.ACTIVE) return Result.success(alarm)
        return repository.acknowledgeAlarm(alarm.id)
    }
}

class SetArmingModeUseCase(private val repository: MonitoringRepository, private val session: () -> Session?) {
    suspend operator fun invoke(mode: ArmingMode): Result<AlarmSystemState> {
        if (session()?.canControl != true) return Result.failure(AppError.Forbidden("Zmiana trybu uzbrojenia wymaga konta administratora."))
        return repository.setArmingMode(mode)
    }
}

data class DashboardSummary(
    val status: Loadable<CoreStatus>,
    val camerasOnline: Int?,
    val camerasOffline: Int?,
    val cameras: List<Camera>,
    val activeAlarms: List<Alarm>,
    val hasCriticalAlarm: Boolean,
    val sensorCount: Int?,
    val sensorsTriggered: Int?,
    val sensorsOffline: Int?,
    val recentEvents: List<SystemEvent>,
    /** Część danych pochodzi z pamięci podręcznej lub ostatnie odświeżenie się nie powiodło. */
    val isStale: Boolean,
    val isLoading: Boolean,
    val error: AppError?,
)

class ObserveDashboardUseCase(private val repository: MonitoringRepository) {
    operator fun invoke(): Flow<DashboardSummary> = combine(
        repository.status, repository.cameras, repository.alarms, repository.sensors, repository.recentEvents,
    ) { status, cameras, alarms, sensors, events -> summarize(status, cameras, alarms, sensors, events) }

    companion object {
        fun summarize(
            status: Loadable<CoreStatus>,
            cameras: Loadable<List<Camera>>,
            alarms: Loadable<List<Alarm>>,
            sensors: Loadable<List<Sensor>>,
            events: Loadable<List<SystemEvent>>,
        ): DashboardSummary {
            val active = alarms.data.orEmpty().filter { it.status == AlarmStatus.ACTIVE }
            val all = listOf(status, cameras, alarms, sensors, events)
            return DashboardSummary(
                status = status,
                camerasOnline = cameras.data?.count { it.status == ConnectionStatus.ONLINE },
                camerasOffline = cameras.data?.count { it.status == ConnectionStatus.OFFLINE },
                cameras = cameras.data.orEmpty(),
                activeAlarms = active,
                hasCriticalAlarm = active.any { it.severity == Severity.CRITICAL },
                sensorCount = sensors.data?.size,
                sensorsTriggered = sensors.data?.count { it.triggered && it.connection == ConnectionStatus.ONLINE },
                sensorsOffline = sensors.data?.count { it.connection == ConnectionStatus.OFFLINE },
                recentEvents = events.data.orEmpty().take(8),
                isStale = all.any { it.isStale },
                isLoading = all.any { it.loading },
                error = all.firstNotNullOfOrNull { it.error },
            )
        }
    }
}
