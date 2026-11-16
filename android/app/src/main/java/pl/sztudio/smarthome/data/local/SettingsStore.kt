package pl.sztudio.smarthome.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import pl.sztudio.smarthome.domain.repository.AppSettings
import pl.sztudio.smarthome.domain.repository.SettingsRepository

class SettingsStore(private val store: DataStore<Preferences>) : SettingsRepository {
    override val settings: Flow<AppSettings> = store.data.map { prefs ->
        AppSettings(
            defaultCameraLayout = prefs[LAYOUT]?.takeIf { it in setOf(1, 4, 6) } ?: 4,
            keepScreenOnDuringPreview = prefs[KEEP_SCREEN_ON] ?: true,
            reduceMotion = prefs[REDUCE_MOTION] ?: false,
        )
    }

    override suspend fun update(transform: (AppSettings) -> AppSettings) {
        val next = transform(settings.first())
        store.edit {
            it[LAYOUT] = next.defaultCameraLayout
            it[KEEP_SCREEN_ON] = next.keepScreenOnDuringPreview
            it[REDUCE_MOTION] = next.reduceMotion
        }
    }

    private companion object {
        val LAYOUT = intPreferencesKey("camera_layout")
        val KEEP_SCREEN_ON = booleanPreferencesKey("keep_screen_on")
        val REDUCE_MOTION = booleanPreferencesKey("reduce_motion")
    }
}
