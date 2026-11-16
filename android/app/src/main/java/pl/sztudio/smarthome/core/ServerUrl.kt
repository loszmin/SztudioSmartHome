package pl.sztudio.smarthome.core

import java.net.URI

/** Adres Sztudio Core. Dozwolony wyłącznie schemat `https` – aplikacja nie łączy się z Core bez szyfrowania. */
@JvmInline
value class ServerUrl private constructor(val value: String) {
    /** Adres bazowy API z końcowym ukośnikiem (wymagany przez Retrofit). */
    val apiBase: String get() = "$value/"

    /** Adres kanału WebSocket (wss://…). */
    fun webSocket(path: String): String = "wss://" + value.removePrefix("https://") + path

    companion object {
        /**
         * Normalizuje i sprawdza adres. Brak schematu = `https://`. Zwraca błąd dla `http://`,
         * innych schematów, ścieżek z parametrami i adresów bez hosta.
         */
        fun parse(input: String): Result<ServerUrl> {
            var text = input.trim().trimEnd('/')
            if (text.isEmpty()) return Result.failure(IllegalArgumentException("Podaj adres serwera Sztudio Core."))
            if (text.startsWith("http://", ignoreCase = true)) return Result.failure(AppError.CleartextNotAllowed)
            if (!text.contains("://")) text = "https://$text"
            val uri = runCatching { URI(text) }.getOrNull()
                ?: return Result.failure(IllegalArgumentException("Adres serwera jest nieprawidłowy."))
            if (!uri.scheme.equals("https", ignoreCase = true)) return Result.failure(AppError.CleartextNotAllowed)
            if (uri.host.isNullOrBlank()) return Result.failure(IllegalArgumentException("Adres serwera nie zawiera nazwy hosta ani adresu IP."))
            if (uri.rawQuery != null || uri.rawFragment != null || uri.rawUserInfo != null) {
                return Result.failure(IllegalArgumentException("Podaj sam adres serwera, np. https://192.168.1.10."))
            }
            if (uri.port != -1 && uri.port !in 1..65535) return Result.failure(IllegalArgumentException("Nieprawidłowy port."))
            val port = if (uri.port == -1 || uri.port == 443) "" else ":${uri.port}"
            val path = uri.rawPath.orEmpty().trimEnd('/')
            return Result.success(ServerUrl("https://${uri.host.lowercase()}$port$path"))
        }

        fun of(value: String): ServerUrl = parse(value).getOrThrow()
    }
}
