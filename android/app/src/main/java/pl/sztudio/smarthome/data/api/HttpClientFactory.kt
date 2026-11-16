package pl.sztudio.smarthome.data.api

import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Response
import pl.sztudio.smarthome.domain.model.ApiTiming
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.time.Instant
import java.util.concurrent.TimeUnit

val ApiJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
}

/** Dostarcza aktualny token i reaguje na odrzucenie sesji przez serwer. */
interface TokenProvider {
    fun currentToken(): String?
    fun onUnauthorized()
}

/** Dodaje nagłówek `Authorization` i zgłasza 401 (poza logowaniem) jako wygaśnięcie sesji. */
class AuthInterceptor(private val tokens: TokenProvider) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val token = tokens.currentToken()
        val authorized = if (token != null && request.header("Authorization") == null) {
            request.newBuilder().header("Authorization", "Bearer $token").build()
        } else {
            request
        }
        val response = chain.proceed(authorized)
        if (response.code == 401 && token != null && !request.url.encodedPath.endsWith("/auth/login")) {
            tokens.onUnauthorized()
        }
        return response
    }
}

/** Mierzy czas odpowiedzi API (backend go nie raportuje – ekran diagnostyki pokazuje pomiar aplikacji). */
class TimingInterceptor(private val record: (ApiTiming) -> Unit) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val started = System.nanoTime()
        val path = chain.request().url.encodedPath
        return try {
            chain.proceed(chain.request()).also {
                record(ApiTiming(path, (System.nanoTime() - started) / 1_000_000, it.code, Instant.now()))
            }
        } catch (error: Exception) {
            record(ApiTiming(path, (System.nanoTime() - started) / 1_000_000, null, Instant.now()))
            throw error
        }
    }
}

object HttpClientFactory {
    /**
     * Klient HTTP dla Core. Weryfikacja TLS korzysta z domyślnego mechanizmu Androida, który stosuje
     * `network_security_config.xml` (CA systemowe + CA użytkownika). Aplikacja nie podmienia
     * TrustManagera ani HostnameVerifiera.
     */
    fun create(tokens: TokenProvider, recordTiming: (ApiTiming) -> Unit): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            // Utrzymanie połączeń WebSocket: ping co 25 s wykrywa zerwane połączenia (np. po zmianie sieci).
            .pingInterval(25, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor(AuthInterceptor(tokens))
            .addInterceptor(TimingInterceptor(recordTiming))
            .build()

    fun retrofit(baseUrl: String, client: OkHttpClient): SztudioApi =
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(ApiJson.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(SztudioApi::class.java)
}
