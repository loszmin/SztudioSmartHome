package pl.sztudio.smarthome.testutil

import okhttp3.mockwebserver.MockResponse
import pl.sztudio.smarthome.domain.model.Alarm
import pl.sztudio.smarthome.domain.model.AlarmSourceType
import pl.sztudio.smarthome.domain.model.AlarmStatus
import pl.sztudio.smarthome.domain.model.Camera
import pl.sztudio.smarthome.domain.model.CameraSource
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.model.Role
import pl.sztudio.smarthome.domain.model.Session
import pl.sztudio.smarthome.domain.model.Severity
import pl.sztudio.smarthome.domain.model.StreamRegistration
import java.time.Instant

/* Odpowiedzi w formacie Sztudio Core (core/app/schemas.py) – pola opcjonalne pominięte tak jak robi to backend. */

fun json(body: String, code: Int = 200) = MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)

fun loginJson(token: String = "jwt-token", expiresAt: String = "2099-01-01T00:00:00Z", role: String = "admin") =
    """{"accessToken":"$token","tokenType":"bearer","expiresAt":"$expiresAt","user":{"id":"u1","username":"admin","role":"$role"}}"""

const val STATUS_JSON = """{"core":{"state":"online","version":"1.0.0","hostname":"core","uptimeSeconds":3600},
"resources":{"cpuPercent":5.0,"memoryPercent":30.0,"diskPercent":40.0},
"services":[{"key":"postgres","name":"PostgreSQL","state":"running"},{"key":"go2rtc","name":"go2rtc (strumienie wideo)","state":"running"}],
"alarmSystem":{"mode":"armed_home","changedAt":"2026-11-15T10:00:00Z","changedBy":"admin"},"serverTime":"2026-11-15T12:00:00Z"}"""

const val CAMERAS_JSON = """[
{"id":"c1","name":"Wejście","location":"Front","status":"online","signalQuality":100,"source":"rtsp","streamName":"cam_1","recording":false,"lastSeenAt":"2026-11-15T12:00:00Z","enabled":true,"streamState":"registered","streamProfile":"main","responseTimeMs":3},
{"id":"c2","name":"Brama","location":"","status":"offline","signalQuality":null,"source":"bcs","channel":2,"streamName":"cam_2","recording":false,"lastSeenAt":null,"enabled":true,"streamState":"registered","errorCode":"timeout","errorMessage":"Urządzenie nie odpowiedziało."},
{"id":"c3","name":"Nowa kamera","location":"","status":"offline","signalQuality":null,"source":"rtsp","streamName":"cam_3","recording":false,"lastSeenAt":null,"enabled":true,"streamState":"not_configured"}]"""

const val ALARMS_JSON = """[
{"id":"a1","title":"Wykrycie dymu","severity":"critical","status":"active","source":{"type":"sensor","name":"Dym – kuchnia","id":"s1"},"location":"Kuchnia","triggeredAt":"2026-11-15T11:59:00Z"},
{"id":"a2","title":"Utrata połączenia z kamerą","severity":"critical","status":"resolved","source":{"type":"camera","name":"Brama","id":"c2"},"triggeredAt":"2026-11-14T08:00:00Z","acknowledgedAt":"2026-11-14T08:05:00Z","acknowledgedBy":"admin","resolvedAt":"2026-11-14T08:30:00Z"}]"""

const val SENSORS_JSON = """[
{"id":"s1","name":"Dym – kuchnia","location":"Kuchnia","type":"smoke","state":"triggered","connection":"online","batteryPercent":80,"lastUpdatedAt":"2026-11-15T11:59:00Z"},
{"id":"s2","name":"Temperatura","location":"Salon","type":"temperature","state":"idle","value":21.5,"unit":"°C","connection":"online","lastUpdatedAt":"2026-11-15T11:58:00Z"},
{"id":"s3","name":"Drzwi","location":"Wiatrołap","type":"contact","state":"idle","connection":"offline","lastUpdatedAt":null}]"""

const val EVENTS_JSON = """[
{"id":"e1","category":"alarm","severity":"critical","title":"Alarm: Wykrycie dymu","source":"Dym – kuchnia","occurredAt":"2026-11-15T11:59:00Z"},
{"id":"e2","category":"camera_offline","severity":"critical","title":"Utrata połączenia z kamerą","source":"Brama","occurredAt":"2026-11-15T10:00:00Z"},
{"id":"e3","category":"przyszla_kategoria","severity":"info","title":"Nieznane","source":"Core","occurredAt":"2026-11-15T09:00:00Z"}]"""

const val DIAGNOSTICS_JSON = """{"generatedAt":"2026-11-15T12:00:00Z","go2rtc":{"state":"running","version":"1.9.15","checkedAt":"2026-11-15T12:00:00Z","streams":2},
"monitor":{"enabled":true,"intervalSeconds":30,"lastRunAt":"2026-11-15T11:59:30Z","lastDurationMs":120},
"devices":[{"id":"c1","kind":"camera","name":"Wejście","address":"192.168.1.64:554/stream1","status":"online","enabled":true,"streamState":"registered","streamConsumers":1,"lastAttemptAt":"2026-11-15T11:59:30Z","lastSuccessAt":"2026-11-15T11:59:30Z","responseTimeMs":4}]}"""

fun session(role: Role = Role.ADMIN, expiresAt: Instant = Instant.parse("2099-01-01T00:00:00Z"), server: String = "https://localhost") =
    Session(server, "jwt-token", "admin", role, expiresAt)

fun camera(id: String = "c1", status: ConnectionStatus = ConnectionStatus.ONLINE, stream: StreamRegistration = StreamRegistration.REGISTERED, enabled: Boolean = true, name: String = "Kamera $id") = Camera(
    id = id, name = name, location = "Front", status = status, signalQuality = if (status == ConnectionStatus.ONLINE) 90 else null,
    source = CameraSource.RTSP, channel = null, resolution = "1920×1080", fps = 15, recording = false, lastSeenAt = null,
    enabled = enabled, streamState = stream, streamProfile = "main", errorCode = null,
    errorMessage = if (status == ConnectionStatus.OFFLINE) "Urządzenie nie odpowiedziało." else null, responseTimeMs = 3,
)

fun alarm(id: String = "a1", status: AlarmStatus = AlarmStatus.ACTIVE, severity: Severity = Severity.CRITICAL, source: AlarmSourceType = AlarmSourceType.SENSOR, at: Instant = Instant.parse("2026-11-15T11:59:00Z")) = Alarm(
    id = id, title = "Alarm $id", description = null, severity = severity, status = status, sourceType = source,
    sourceName = "Źródło $id", location = null, triggeredAt = at, acknowledgedAt = null, acknowledgedBy = null, resolvedAt = null,
)
