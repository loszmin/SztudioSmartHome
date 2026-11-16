package pl.sztudio.smarthome.data.api

import pl.sztudio.smarthome.domain.model.Alarm
import pl.sztudio.smarthome.domain.model.AlarmSourceType
import pl.sztudio.smarthome.domain.model.AlarmStatus
import pl.sztudio.smarthome.domain.model.AlarmSystemState
import pl.sztudio.smarthome.domain.model.ArmingMode
import pl.sztudio.smarthome.domain.model.Camera
import pl.sztudio.smarthome.domain.model.CameraSource
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.model.CoreService
import pl.sztudio.smarthome.domain.model.CoreState
import pl.sztudio.smarthome.domain.model.CoreStatus
import pl.sztudio.smarthome.domain.model.DeviceDiagnostics
import pl.sztudio.smarthome.domain.model.Diagnostics
import pl.sztudio.smarthome.domain.model.EventCategory
import pl.sztudio.smarthome.domain.model.Go2rtcState
import pl.sztudio.smarthome.domain.model.Role
import pl.sztudio.smarthome.domain.model.Sensor
import pl.sztudio.smarthome.domain.model.SensorType
import pl.sztudio.smarthome.domain.model.ServiceState
import pl.sztudio.smarthome.domain.model.Severity
import pl.sztudio.smarthome.domain.model.StreamRegistration
import pl.sztudio.smarthome.domain.model.SystemEvent
import java.time.Instant

/* Mapowanie DTO → model domenowy. Nieznane wartości (nowsza wersja Core) nie przerywają działania. */

internal fun parseInstant(value: String?): Instant? = value?.let { runCatching { Instant.parse(it) }.getOrNull() }
private fun instant(value: String): Instant = parseInstant(value) ?: Instant.EPOCH

internal fun connection(value: String) = if (value == "online") ConnectionStatus.ONLINE else ConnectionStatus.OFFLINE
internal fun severity(value: String) = when (value) {
    "critical" -> Severity.CRITICAL
    "warning" -> Severity.WARNING
    else -> Severity.INFO
}

fun role(value: String) = if (value == "admin") Role.ADMIN else Role.VIEWER

fun AlarmSystemStateDto.toDomain() = AlarmSystemState(
    mode = ArmingMode.fromApi(mode) ?: ArmingMode.DISARMED,
    changedAt = instant(changedAt),
    changedBy = changedBy,
)

fun SystemStatusDto.toDomain() = CoreStatus(
    state = when (core.state) {
        "online" -> CoreState.ONLINE
        "degraded" -> CoreState.DEGRADED
        else -> CoreState.OFFLINE
    },
    version = core.version,
    hostname = core.hostname,
    uptimeSeconds = core.uptimeSeconds,
    cpuPercent = resources.cpuPercent,
    memoryPercent = resources.memoryPercent,
    diskPercent = resources.diskPercent,
    services = services.map {
        CoreService(
            it.key, it.name,
            when (it.state) {
                "running" -> ServiceState.RUNNING
                "error" -> ServiceState.ERROR
                else -> ServiceState.STOPPED
            },
        )
    },
    alarmSystem = alarmSystem.toDomain(),
    serverTime = instant(serverTime),
)

internal fun streamRegistration(value: String?) = when (value) {
    null -> null
    "registered" -> StreamRegistration.REGISTERED
    "not_configured" -> StreamRegistration.NOT_CONFIGURED
    "disabled" -> StreamRegistration.DISABLED
    "error" -> StreamRegistration.ERROR
    else -> StreamRegistration.UNKNOWN
}

fun CameraDto.toDomain() = Camera(
    id = id,
    name = name,
    location = location,
    status = connection(status),
    signalQuality = signalQuality,
    source = when (source) {
        "bcs" -> CameraSource.BCS
        "onvif" -> CameraSource.ONVIF
        "rtsp" -> CameraSource.RTSP
        else -> CameraSource.UNKNOWN
    },
    channel = channel,
    resolution = resolution,
    fps = fps,
    recording = recording,
    lastSeenAt = parseInstant(lastSeenAt),
    enabled = enabled,
    streamState = streamRegistration(streamState) ?: StreamRegistration.UNKNOWN,
    streamProfile = streamProfile,
    errorCode = errorCode,
    errorMessage = errorMessage,
    responseTimeMs = responseTimeMs,
)

fun AlarmDto.toDomain() = Alarm(
    id = id,
    title = title,
    description = description,
    severity = severity(severity),
    status = when (status) {
        "active" -> AlarmStatus.ACTIVE
        "acknowledged" -> AlarmStatus.ACKNOWLEDGED
        else -> AlarmStatus.RESOLVED
    },
    sourceType = when (source.type) {
        "sensor" -> AlarmSourceType.SENSOR
        "camera" -> AlarmSourceType.CAMERA
        "network" -> AlarmSourceType.NETWORK
        "system" -> AlarmSourceType.SYSTEM
        else -> AlarmSourceType.UNKNOWN
    },
    sourceName = source.name,
    location = location,
    triggeredAt = instant(triggeredAt),
    acknowledgedAt = parseInstant(acknowledgedAt),
    acknowledgedBy = acknowledgedBy,
    resolvedAt = parseInstant(resolvedAt),
)

fun SensorDto.toDomain() = Sensor(
    id = id,
    name = name,
    location = location,
    type = when (type) {
        "motion" -> SensorType.MOTION
        "contact" -> SensorType.CONTACT
        "flood" -> SensorType.FLOOD
        "smoke" -> SensorType.SMOKE
        "temperature" -> SensorType.TEMPERATURE
        "vibration" -> SensorType.VIBRATION
        else -> SensorType.UNKNOWN
    },
    triggered = state == "triggered",
    value = value,
    unit = unit,
    connection = connection(connection),
    batteryPercent = batteryPercent,
    lastUpdatedAt = parseInstant(lastUpdatedAt),
)

fun EventDto.toDomain() = SystemEvent(
    id = id,
    category = EventCategory.fromApi(category),
    severity = severity(severity),
    title = title,
    description = description,
    source = source,
    occurredAt = instant(occurredAt),
)

fun DiagnosticsDto.toDomain() = Diagnostics(
    generatedAt = instant(generatedAt),
    go2rtcState = when (go2rtc.state) {
        "running" -> Go2rtcState.RUNNING
        "error" -> Go2rtcState.ERROR
        else -> Go2rtcState.NOT_CONFIGURED
    },
    go2rtcVersion = go2rtc.version,
    go2rtcStreams = go2rtc.streams,
    go2rtcError = go2rtc.errorMessage,
    monitorEnabled = monitor.enabled,
    monitorIntervalSeconds = monitor.intervalSeconds,
    monitorLastRunAt = parseInstant(monitor.lastRunAt),
    devices = devices.map {
        DeviceDiagnostics(
            id = it.id, kind = it.kind, name = it.name, address = it.address, status = connection(it.status),
            enabled = it.enabled, streamState = streamRegistration(it.streamState), streamConsumers = it.streamConsumers,
            lastAttemptAt = parseInstant(it.lastAttemptAt), lastSuccessAt = parseInstant(it.lastSuccessAt),
            errorCode = it.errorCode, errorMessage = it.errorMessage, responseTimeMs = it.responseTimeMs,
        )
    },
)
