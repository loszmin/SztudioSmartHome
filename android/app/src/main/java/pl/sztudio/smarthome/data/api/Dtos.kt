package pl.sztudio.smarthome.data.api

import kotlinx.serialization.Serializable

/*
 * Modele odpowiedzi Sztudio Core (core/app/schemas.py). Backend pomija pola bez wartości,
 * dlatego każde pole opcjonalne ma wartość domyślną. Daty – ISO 8601 UTC.
 */

@Serializable data class HealthDto(val status: String)

@Serializable data class LoginRequestDto(val username: String, val password: String)

@Serializable data class UserDto(val id: String, val username: String, val role: String)

@Serializable
data class LoginResponseDto(
    val accessToken: String,
    val tokenType: String = "bearer",
    val expiresAt: String,
    val user: UserDto,
)

@Serializable data class CoreInfoDto(val state: String, val version: String, val hostname: String, val uptimeSeconds: Long)

@Serializable data class ResourcesDto(val cpuPercent: Double, val memoryPercent: Double, val diskPercent: Double)

@Serializable data class CoreServiceDto(val key: String, val name: String, val state: String)

@Serializable data class AlarmSystemStateDto(val mode: String, val changedAt: String, val changedBy: String? = null)

@Serializable
data class SystemStatusDto(
    val core: CoreInfoDto,
    val resources: ResourcesDto,
    val services: List<CoreServiceDto> = emptyList(),
    val alarmSystem: AlarmSystemStateDto,
    val serverTime: String,
)

@Serializable data class ArmingRequestDto(val mode: String)

@Serializable
data class CameraDto(
    val id: String,
    val name: String,
    val location: String = "",
    val status: String,
    val signalQuality: Int? = null,
    val source: String = "rtsp",
    val channel: Int? = null,
    val streamName: String = "",
    val resolution: String? = null,
    val fps: Int? = null,
    val recording: Boolean = false,
    val lastSeenAt: String? = null,
    val enabled: Boolean = true,
    val streamState: String = "not_configured",
    val streamProfile: String? = null,
    val recorderId: String? = null,
    val lastAttemptAt: String? = null,
    val lastSuccessAt: String? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null,
    val responseTimeMs: Int? = null,
)

@Serializable data class AlarmSourceDto(val type: String, val name: String, val id: String? = null)

@Serializable
data class AlarmDto(
    val id: String,
    val title: String,
    val description: String? = null,
    val severity: String,
    val status: String,
    val source: AlarmSourceDto,
    val location: String? = null,
    val triggeredAt: String,
    val acknowledgedAt: String? = null,
    val acknowledgedBy: String? = null,
    val resolvedAt: String? = null,
)

@Serializable
data class SensorDto(
    val id: String,
    val name: String,
    val location: String = "",
    val type: String,
    val state: String,
    val value: Double? = null,
    val unit: String? = null,
    val connection: String,
    val batteryPercent: Int? = null,
    val lastUpdatedAt: String? = null,
)

@Serializable
data class EventDto(
    val id: String,
    val category: String,
    val severity: String = "info",
    val title: String,
    val description: String? = null,
    val source: String,
    val occurredAt: String,
)

@Serializable
data class Go2rtcStatusDto(
    val state: String,
    val version: String? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null,
    val checkedAt: String? = null,
    val streams: Int? = null,
)

@Serializable
data class MonitorStatusDto(
    val enabled: Boolean,
    val intervalSeconds: Int,
    val lastRunAt: String? = null,
    val lastDurationMs: Int? = null,
)

@Serializable
data class DeviceDiagnosticsDto(
    val id: String,
    val kind: String,
    val name: String,
    val address: String? = null,
    val status: String,
    val enabled: Boolean = true,
    val streamState: String? = null,
    val streamConsumers: Int? = null,
    val streamConnected: Boolean? = null,
    val lastAttemptAt: String? = null,
    val lastSuccessAt: String? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null,
    val responseTimeMs: Int? = null,
)

@Serializable
data class DiagnosticsDto(
    val generatedAt: String,
    val go2rtc: Go2rtcStatusDto,
    val monitor: MonitorStatusDto,
    val devices: List<DeviceDiagnosticsDto> = emptyList(),
)

/** Koperta komunikatu WebSocket: `{type, data, timestamp}`. */
@Serializable data class RealtimeMessageDto(val type: String, val timestamp: String? = null)
