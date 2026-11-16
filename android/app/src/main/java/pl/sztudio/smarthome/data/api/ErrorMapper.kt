package pl.sztudio.smarthome.data.api

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.SerializationException
import pl.sztudio.smarthome.core.AppError
import retrofit2.HttpException
import java.io.IOException
import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.cert.CertPathValidatorException
import java.security.cert.CertificateException
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.SSLPeerUnverifiedException
import kotlinx.coroutines.CancellationException

/** Opis błędu z odpowiedzi Core: `{"detail": "…"}`, `{"detail": {"code","message"}}` lub lista błędów walidacji. */
data class ErrorDetail(val message: String?, val code: String?)

object ErrorMapper {
    private val json = Json { ignoreUnknownKeys = true }

    fun parseDetail(body: String?): ErrorDetail {
        if (body.isNullOrBlank()) return ErrorDetail(null, null)
        val detail = runCatching { json.parseToJsonElement(body).jsonObject["detail"] }.getOrNull()
        return when (detail) {
            is JsonPrimitive -> ErrorDetail(detail.contentOrNull, null)
            is JsonObject -> ErrorDetail(
                detail["message"]?.jsonPrimitive?.contentOrNull,
                detail["code"]?.jsonPrimitive?.contentOrNull,
            )
            is JsonArray -> ErrorDetail(
                (detail.firstOrNull() as? JsonObject)?.get("msg")?.jsonPrimitive?.contentOrNull?.let { "Nieprawidłowe dane: $it" },
                "validation",
            )
            else -> ErrorDetail(null, null)
        }
    }

    /** Zamienia odpowiedź HTTP z kodem błędu na [AppError]. */
    fun fromHttp(status: Int, body: String?, retryAfter: String? = null, isLogin: Boolean = false): AppError {
        val detail = parseDetail(body)
        return when {
            status == 401 && isLogin -> AppError.InvalidCredentials()
            status == 401 -> AppError.SessionExpired
            status == 403 -> AppError.Forbidden(detail.message ?: "Brak uprawnień do tej operacji.")
            status == 404 -> AppError.NotFound(detail.message ?: "Nie znaleziono zasobu.")
            status == 429 -> AppError.LoginLocked(retryAfter?.toIntOrNull()?.coerceAtLeast(1) ?: 60)
            else -> AppError.Server(status, detail.message ?: "Serwer zwrócił błąd $status.", detail.code)
        }
    }

    /** Zamienia wyjątek z warstwy sieciowej na [AppError]. Anulowanie korutyny jest przepuszczane dalej. */
    fun fromThrowable(error: Throwable, isLogin: Boolean = false): AppError = when (error) {
        is CancellationException -> throw error
        is AppError -> error
        is HttpException -> fromHttp(
            error.code(),
            runCatching { error.response()?.errorBody()?.string() }.getOrNull(),
            error.response()?.headers()?.get("Retry-After"),
            isLogin,
        )
        is SSLPeerUnverifiedException -> AppError.CertificateHostMismatch
        is SSLHandshakeException -> if (error.isUntrustedCertificate()) AppError.UntrustedCertificate else AppError.Unknown("Nie udało się nawiązać szyfrowanego połączenia z serwerem.")
        is UnknownHostException -> AppError.ServerNotFound
        is ConnectException, is NoRouteToHostException -> AppError.Unreachable
        is SocketTimeoutException -> AppError.Timeout
        is InterruptedIOException -> AppError.Timeout
        is SerializationException -> AppError.Protocol()
        is IOException -> if (error.cause is CertificateException || error.isUntrustedCertificate()) AppError.UntrustedCertificate else AppError.Unreachable
        else -> AppError.Unknown(error.message ?: "Wystąpił nieoczekiwany błąd.")
    }

    private fun Throwable.isUntrustedCertificate(): Boolean {
        var current: Throwable? = this
        while (current != null) {
            if (current is CertPathValidatorException) return true
            val text = current.message.orEmpty()
            if ("Trust anchor for certification path not found" in text || "unable to find valid certification path" in text) return true
            if (current is CertificateException && "hostname" !in text.lowercase()) return true
            current = current.cause
        }
        return false
    }
}
