package pl.sztudio.smarthome.data.auth

/**
 * Ochrona przed wielokrotnymi próbami logowania po stronie aplikacji. Uzupełnia blokadę
 * serwera (HTTP 429): po [maxFailures] kolejnych błędach logowanie jest wstrzymane na [lockSeconds].
 */
class LoginThrottle(
    private val maxFailures: Int = 5,
    private val lockSeconds: Int = 30,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private var failures = 0
    private var lockedUntil = 0L

    @Synchronized
    fun remainingSeconds(): Int {
        val left = lockedUntil - clock()
        return if (left > 0) ((left + 999) / 1000).toInt() else 0
    }

    @Synchronized
    fun recordFailure() {
        failures += 1
        if (failures >= maxFailures) {
            lockedUntil = clock() + lockSeconds * 1000L
            failures = 0
        }
    }

    /** Blokada zgłoszona przez serwer (nagłówek Retry-After). */
    @Synchronized
    fun lockFor(seconds: Int) {
        lockedUntil = maxOf(lockedUntil, clock() + seconds * 1000L)
    }

    @Synchronized
    fun reset() {
        failures = 0
        lockedUntil = 0
    }
}
