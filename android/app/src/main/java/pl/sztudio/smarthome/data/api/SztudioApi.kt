package pl.sztudio.smarthome.data.api

import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Punkty Sztudio Core używane przez aplikację. Ścieżki odpowiadają trasom FastAPI
 * (docs/ANDROID_API_MAPPING.md) – aplikacja nie korzysta z żadnych innych.
 */
interface SztudioApi {
    @GET("api/v1/health")
    suspend fun health(): HealthDto

    @POST("api/v1/auth/login")
    suspend fun login(@Body body: LoginRequestDto): LoginResponseDto

    @GET("api/v1/auth/me")
    suspend fun me(): UserDto

    @GET("api/v1/system/status")
    suspend fun systemStatus(): SystemStatusDto

    @GET("api/v1/cameras")
    suspend fun cameras(): List<CameraDto>

    /** Sygnalizacja WebRTC: pełne SDP oferty (`application/sdp`) → SDP odpowiedzi go2rtc. */
    @POST("api/v1/cameras/{id}/webrtc")
    suspend fun webrtcOffer(@Path("id") cameraId: String, @Body offer: RequestBody): ResponseBody

    @GET("api/v1/alarms")
    suspend fun alarms(@Query("limit") limit: Int): List<AlarmDto>

    @POST("api/v1/alarms/{id}/acknowledge")
    suspend fun acknowledgeAlarm(@Path("id") alarmId: String): AlarmDto

    @PUT("api/v1/alarms/arming")
    suspend fun setArming(@Body body: ArmingRequestDto): AlarmSystemStateDto

    @GET("api/v1/sensors")
    suspend fun sensors(): List<SensorDto>

    @GET("api/v1/events")
    suspend fun events(
        @Query("category") category: String?,
        @Query("from") from: String?,
        @Query("to") to: String?,
        @Query("limit") limit: Int,
    ): List<EventDto>

    @GET("api/v1/diagnostics")
    suspend fun diagnostics(): DiagnosticsDto

    @POST("api/v1/diagnostics/run")
    suspend fun runDiagnostics(): DiagnosticsDto
}
