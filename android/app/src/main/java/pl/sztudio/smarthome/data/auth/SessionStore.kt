package pl.sztudio.smarthome.data.auth

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import pl.sztudio.smarthome.domain.model.Role
import pl.sztudio.smarthome.domain.model.Session
import java.time.Instant

/**
 * Trwały zapis sesji. Token jest przechowywany wyłącznie w postaci zaszyfrowanej ([CryptoBox]);
 * hasło nie jest zapisywane nigdy.
 */
class SessionStore(private val store: DataStore<Preferences>, private val crypto: CryptoBox) {
    val lastServerUrl: Flow<String?> = store.data.map { it[SERVER_URL] }

    suspend fun load(): Session? {
        val prefs = store.data.first()
        val encrypted = prefs[TOKEN] ?: return null
        val token = runCatching { crypto.decrypt(encrypted).decodeToString() }.getOrNull() ?: return null
        return Session(
            serverUrl = prefs[SERVER_URL] ?: return null,
            token = token,
            username = prefs[USERNAME] ?: return null,
            role = if (prefs[ROLE] == "admin") Role.ADMIN else Role.VIEWER,
            expiresAt = prefs[EXPIRES_AT]?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return null,
        )
    }

    suspend fun save(session: Session) {
        val encrypted = crypto.encrypt(session.token.encodeToByteArray())
        store.edit {
            it[SERVER_URL] = session.serverUrl
            it[TOKEN] = encrypted
            it[USERNAME] = session.username
            it[ROLE] = if (session.role == Role.ADMIN) "admin" else "viewer"
            it[EXPIRES_AT] = session.expiresAt.toString()
        }
    }

    /** Usuwa sesję; adres serwera zostaje jako podpowiedź przy kolejnym logowaniu. */
    suspend fun clear() {
        store.edit {
            it.remove(TOKEN)
            it.remove(USERNAME)
            it.remove(ROLE)
            it.remove(EXPIRES_AT)
        }
    }

    suspend fun rememberServer(url: String) {
        store.edit { it[SERVER_URL] = url }
    }

    private companion object {
        val SERVER_URL = stringPreferencesKey("server_url")
        val TOKEN = stringPreferencesKey("token_encrypted")
        val USERNAME = stringPreferencesKey("username")
        val ROLE = stringPreferencesKey("role")
        val EXPIRES_AT = stringPreferencesKey("expires_at")
    }
}
