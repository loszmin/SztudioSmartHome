package pl.sztudio.smarthome.domain.model

import java.time.Instant

enum class ConnectionStatus { ONLINE, OFFLINE }
enum class Severity { INFO, WARNING, CRITICAL }
enum class Role { ADMIN, VIEWER }

enum class ArmingMode(val apiValue: String) {
    DISARMED("disarmed"), ARMED_HOME("armed_home"), ARMED_AWAY("armed_away");

    companion object {
        fun fromApi(value: String): ArmingMode? = entries.firstOrNull { it.apiValue == value }
    }
}

data class Session(
    val serverUrl: String,
    val token: String,
    val username: String,
    val role: Role,
    val expiresAt: Instant,
) {
    fun isExpired(now: Instant = Instant.now()): Boolean = !now.isBefore(expiresAt)
    val canControl: Boolean get() = role == Role.ADMIN
    override fun toString(): String = "Session(serverUrl=$serverUrl, username=$username, role=$role, expiresAt=$expiresAt)"
}

enum class CoreState { ONLINE, DEGRADED, OFFLINE }
enum class ServiceState { RUNNING, STOPPED, ERROR }

data class CoreService(val key: String, val name: String, val state: ServiceState)
data class AlarmSystemState(val mode: ArmingMode, val changedAt: Instant, val changedBy: String?)

data class CoreStatus(
    val state: CoreState,
    val version: String,
    val hostname: String,
    val uptimeSeconds: Long,
    val cpuPercent: Double,
    val memoryPercent: Double,
    val diskPercent: Double,
    val services: List<CoreService>,
    val alarmSystem: AlarmSystemState,
    val serverTime: Instant,
) {
    val go2rtc: CoreService? get() = services.firstOrNull { it.key == "go2rtc" }
}

enum class CameraSource { BCS, ONVIF, RTSP, UNKNOWN }
enum class StreamRegistration { NOT_CONFIGURED, DISABLED, REGISTERED, ERROR, UNKNOWN }

data class Camera(
    val id: String,
    val name: String,
    val location: String,
    val status: ConnectionStatus,
    val signalQuality: Int?,
    val source: CameraSource,
    val channel: Int?,
    val resolution: String?,
    val fps: Int?,
    val recording: Boolean,
    val lastSeenAt: Instant?,
    val enabled: Boolean,
    val streamState: StreamRegistration,
    val streamProfile: String?,
    val errorCode: String?,
    val errorMessage: String?,
    val responseTimeMs: Int?,
) {
    /** Czy ma sens zestawiać podgląd (kamera włączona, online, strumień zarejestrowany w go2rtc). */
    val canStream: Boolean
        get() = enabled && status == ConnectionStatus.ONLINE &&
            (streamState == StreamRegistration.REGISTERED || streamState == StreamRegistration.ERROR)
}

enum class AlarmStatus { ACTIVE, ACKNOWLEDGED, RESOLVED }
enum class AlarmSourceType { SENSOR, CAMERA, NETWORK, SYSTEM, UNKNOWN }

data class Alarm(
    val id: String,
    val title: String,
    val description: String?,
    val severity: Severity,
    val status: AlarmStatus,
    val sourceType: AlarmSourceType,
    val sourceName: String,
    val location: String?,
    val triggeredAt: Instant,
    val acknowledgedAt: Instant?,
    val acknowledgedBy: String?,
    val resolvedAt: Instant?,
) {
    /** Awaria techniczna (kamera, sieć, system) – w odróżnieniu od alarmu z czujnika. */
    val isFailure: Boolean get() = sourceType in setOf(AlarmSourceType.CAMERA, AlarmSourceType.NETWORK, AlarmSourceType.SYSTEM)
}

enum class SensorType { MOTION, CONTACT, FLOOD, SMOKE, TEMPERATURE, VIBRATION, UNKNOWN }

data class Sensor(
    val id: String,
    val name: String,
    val location: String,
    val type: SensorType,
    val triggered: Boolean,
    val value: Double?,
    val unit: String?,
    val connection: ConnectionStatus,
    val batteryPercent: Int?,
    val lastUpdatedAt: Instant?,
)

enum class EventCategory(val apiValue: String) {
    MOTION("motion"), CAMERA_OFFLINE("camera_offline"), DEVICE_ONLINE("device_online"),
    DOOR("door"), ALARM("alarm"), RESTART("restart");

    companion object {
        fun fromApi(value: String): EventCategory? = entries.firstOrNull { it.apiValue == value }
    }
}

data class SystemEvent(
    val id: String,
    /** `null` – kategoria nieznana tej wersji aplikacji (pokazywana jako „Inne”). */
    val category: EventCategory?,
    val severity: Severity,
    val title: String,
    val description: String?,
    val source: String,
    val occurredAt: Instant,
)

data class EventQuery(
    val category: EventCategory? = null,
    val from: Instant? = null,
    val to: Instant? = null,
    val limit: Int = 200,
)

enum class Go2rtcState { RUNNING, ERROR, NOT_CONFIGURED }

data class DeviceDiagnostics(
    val id: String,
    val kind: String,
    val name: String,
    val address: String?,
    val status: ConnectionStatus,
    val enabled: Boolean,
    val streamState: StreamRegistration?,
    val streamConsumers: Int?,
    val lastAttemptAt: Instant?,
    val lastSuccessAt: Instant?,
    val errorCode: String?,
    val errorMessage: String?,
    val responseTimeMs: Int?,
)

data class Diagnostics(
    val generatedAt: Instant,
    val go2rtcState: Go2rtcState,
    val go2rtcVersion: String?,
    val go2rtcStreams: Int?,
    val go2rtcError: String?,
    val monitorEnabled: Boolean,
    val monitorIntervalSeconds: Int,
    val monitorLastRunAt: Instant?,
    val devices: List<DeviceDiagnostics>,
)

/** Pomiar czasu odpowiedzi API wykonany przez aplikację (backend go nie raportuje). */
data class ApiTiming(val path: String, val durationMs: Long, val status: Int?, val at: Instant)

/** Błąd połączenia zarejestrowany przez aplikację (do ekranu diagnostyki). */
data class ClientError(val at: Instant, val context: String, val message: String)
