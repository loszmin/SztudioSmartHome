package pl.sztudio.smarthome.core

import java.time.Instant

/**
 * Stan zasobu pobieranego z Core.
 *
 * Dane mogą pochodzić z pamięci podręcznej albo z odpowiedzi, po której kolejne odświeżenie
 * się nie powiodło – wtedy [isStale] = true i interfejs pokazuje je jako nieaktualne.
 */
data class Loadable<out T>(
    val data: T? = null,
    /** Chwila pobrania danych z serwera. */
    val updatedAt: Instant? = null,
    val loading: Boolean = false,
    val error: AppError? = null,
    /** Dane odczytane z pamięci podręcznej i jeszcze niepotwierdzone przez serwer. */
    val fromCache: Boolean = false,
) {
    val isStale: Boolean get() = data != null && (error != null || fromCache)
    val isInitialLoading: Boolean get() = data == null && error == null

    fun loading(): Loadable<T> = copy(loading = true)

    companion object {
        fun <T> success(data: T, at: Instant = Instant.now()): Loadable<T> = Loadable(data, at)
    }
}

/** Wynik nieudanego odświeżenia: dane zostają, ale są oznaczone jako nieaktualne. */
fun <T> Loadable<T>.failed(error: AppError): Loadable<T> = copy(loading = false, error = error)
