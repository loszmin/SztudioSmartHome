package pl.sztudio.smarthome.core

/**
 * Błędy aplikacji z komunikatem dla użytkownika. Każdy błąd sieci, TLS lub API jest
 * zamieniany na jeden z tych typów w warstwie danych – interfejs nie widzi wyjątków bibliotek.
 */
sealed class AppError(val userMessage: String, val code: String? = null) : Exception(userMessage) {
    /** Certyfikat serwera nie jest zaufany (najczęściej: nie zainstalowano lokalnego CA Sztudio). */
    data object UntrustedCertificate : AppError(
        "Certyfikat serwera nie jest zaufany. Zainstaluj certyfikat CA Sztudio na telefonie (Ustawienia → Certyfikat CA).",
        "tls_untrusted",
    )

    /** Certyfikat jest zaufany, ale wystawiony dla innego adresu. */
    data object CertificateHostMismatch : AppError(
        "Certyfikat serwera nie obejmuje tego adresu. Użyj adresu podanego w SZTUDIO_LAN_IP lub SZTUDIO_TLS_HOSTS.",
        "tls_hostname",
    )

    data object ServerNotFound : AppError("Nie można odnaleźć serwera pod tym adresem.", "dns")
    data object Unreachable : AppError("Sztudio Core jest nieosiągalny. Sprawdź, czy telefon jest w sieci domowej.", "unreachable")
    data object Timeout : AppError("Serwer nie odpowiedział w wyznaczonym czasie.", "timeout")
    data object NoNetwork : AppError("Brak połączenia z siecią.", "no_network")
    data object CleartextNotAllowed : AppError("Połączenie musi używać HTTPS. Adres powinien zaczynać się od https://.", "cleartext")

    /** Sesja wygasła lub token został unieważniony (np. zmiana hasła). */
    data object SessionExpired : AppError("Sesja wygasła. Zaloguj się ponownie.", "session_expired")
    class InvalidCredentials(message: String = "Nieprawidłowy login lub hasło.") : AppError(message, "auth_failed")
    class LoginLocked(val retryAfterSeconds: Int) :
        AppError("Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za $retryAfterSeconds s.", "login_locked")
    class Forbidden(message: String = "Brak uprawnień do tej operacji.") : AppError(message, "forbidden")
    class NotFound(message: String = "Nie znaleziono zasobu.") : AppError(message, "not_found")
    class Server(val status: Int, message: String, code: String? = null) : AppError(message, code)
    class Protocol(message: String = "Nieprawidłowa odpowiedź serwera.") : AppError(message, "protocol")
    class Unknown(message: String = "Wystąpił nieoczekiwany błąd.") : AppError(message, "unknown")
}

/** Zamienia dowolny wyjątek na [AppError] (błędy spoza warstwy danych trafiają do [AppError.Unknown]). */
fun Throwable.asAppError(): AppError = this as? AppError ?: AppError.Unknown(message ?: "Wystąpił nieoczekiwany błąd.")
