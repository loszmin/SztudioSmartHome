package pl.sztudio.smarthome.data.local

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import pl.sztudio.smarthome.data.api.AlarmDto
import pl.sztudio.smarthome.data.api.ApiJson
import pl.sztudio.smarthome.data.api.CameraDto
import pl.sztudio.smarthome.data.api.EventDto
import pl.sztudio.smarthome.data.api.SensorDto
import pl.sztudio.smarthome.data.api.SystemStatusDto
import pl.sztudio.smarthome.data.auth.CryptoBox
import java.io.File

/** Ostatni znany stan systemu – pokazywany jako nieaktualny, gdy Core jest nieosiągalny. */
@Serializable
data class Snapshot(
    val serverUrl: String,
    val status: SystemStatusDto? = null,
    val statusAt: String? = null,
    val cameras: List<CameraDto>? = null,
    val camerasAt: String? = null,
    val alarms: List<AlarmDto>? = null,
    val alarmsAt: String? = null,
    val sensors: List<SensorDto>? = null,
    val sensorsAt: String? = null,
    val events: List<EventDto>? = null,
    val eventsAt: String? = null,
)

/**
 * Zapis migawki stanu w pliku prywatnym aplikacji, zaszyfrowanej kluczem z Android Keystore
 * (nazwy kamer, lokalizacje i zdarzenia opisują dom). Usuwana przy wylogowaniu.
 */
class SnapshotCache(private val file: File, private val crypto: CryptoBox) {
    suspend fun load(serverUrl: String): Snapshot? = withContext(Dispatchers.IO) {
        if (!file.exists()) return@withContext null
        runCatching {
            val json = crypto.decrypt(file.readText()).decodeToString()
            ApiJson.decodeFromString(Snapshot.serializer(), json)
        }.getOrNull()?.takeIf { it.serverUrl == serverUrl }
    }

    suspend fun save(snapshot: Snapshot) = withContext(Dispatchers.IO) {
        val encrypted = crypto.encrypt(ApiJson.encodeToString(Snapshot.serializer(), snapshot).encodeToByteArray())
        val temp = File(file.parentFile, file.name + ".tmp")
        temp.writeText(encrypted)
        temp.renameTo(file)
    }

    suspend fun clear() = withContext(Dispatchers.IO) { file.delete() }
}
