package pl.sztudio.smarthome.data.api

import okhttp3.OkHttpClient

/** Udostępnia klienta API dla wskazanego serwera (klient jest współdzielony, Retrofit – zapamiętywany per adres). */
class ApiProvider(val client: OkHttpClient) {
    @Volatile private var cached: Pair<String, SztudioApi>? = null

    fun forServer(serverUrl: String): SztudioApi {
        cached?.let { (url, api) -> if (url == serverUrl) return api }
        return HttpClientFactory.retrofit("$serverUrl/", client).also { cached = serverUrl to it }
    }
}
