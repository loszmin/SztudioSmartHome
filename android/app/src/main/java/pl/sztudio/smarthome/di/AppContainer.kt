package pl.sztudio.smarthome.di

import android.content.Context
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import pl.sztudio.smarthome.data.api.ApiProvider
import pl.sztudio.smarthome.data.api.HttpClientFactory
import pl.sztudio.smarthome.data.api.TokenProvider
import pl.sztudio.smarthome.data.auth.KeystoreCryptoBox
import pl.sztudio.smarthome.data.auth.LoginThrottle
import pl.sztudio.smarthome.data.auth.SessionManager
import pl.sztudio.smarthome.data.auth.SessionStore
import pl.sztudio.smarthome.data.local.AndroidNetworkMonitor
import pl.sztudio.smarthome.data.local.NetworkMonitor
import pl.sztudio.smarthome.data.local.SettingsStore
import pl.sztudio.smarthome.data.local.SnapshotCache
import pl.sztudio.smarthome.data.repository.MonitoringRepositoryImpl
import pl.sztudio.smarthome.data.repository.SyncCoordinator
import pl.sztudio.smarthome.data.webrtc.CameraStreamManager
import pl.sztudio.smarthome.data.webrtc.WebRtcEngine
import pl.sztudio.smarthome.domain.repository.AuthRepository
import pl.sztudio.smarthome.domain.repository.MonitoringRepository
import pl.sztudio.smarthome.domain.repository.RealtimeRepository
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.domain.repository.SettingsRepository
import pl.sztudio.smarthome.domain.usecase.AcknowledgeAlarmUseCase
import pl.sztudio.smarthome.domain.usecase.LoginUseCase
import pl.sztudio.smarthome.domain.usecase.ObserveDashboardUseCase
import pl.sztudio.smarthome.domain.usecase.SetArmingModeUseCase
import pl.sztudio.smarthome.domain.usecase.TestServerUseCase
import pl.sztudio.smarthome.data.websocket.RealtimeClient
import java.io.File

private val Context.sessionDataStore by preferencesDataStore("session")
private val Context.settingsDataStore by preferencesDataStore("settings")

/** Zależności aplikacji (ręczne wstrzykiwanie – bez generowania kodu). */
interface AppDependencies {
    val auth: AuthRepository
    val monitoring: MonitoringRepository
    val realtime: RealtimeRepository
    val settings: SettingsRepository
    val streams: CameraStreamManager
    val webRtc: WebRtcEngine?
    val network: NetworkMonitor
    val login: LoginUseCase
    val testServer: TestServerUseCase
    val acknowledgeAlarm: AcknowledgeAlarmUseCase
    val setArmingMode: SetArmingModeUseCase
    val observeDashboard: ObserveDashboardUseCase
}

class AppContainer(context: Context) : AppDependencies {
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val crypto = KeystoreCryptoBox()

    private val tokenBridge = object : TokenProvider {
        override fun currentToken(): String? = sessionManager.currentToken()
        override fun onUnauthorized() = sessionManager.onUnauthorized()
    }

    private val httpClient: okhttp3.OkHttpClient = HttpClientFactory.create(tokenBridge) { monitoringImpl.recordTiming(it) }
    private val apis = ApiProvider(httpClient)
    private val snapshotCache = SnapshotCache(File(appContext.filesDir, "snapshot.bin"), crypto)

    private val sessionManager: SessionManager = SessionManager(
        store = SessionStore(appContext.sessionDataStore, crypto),
        apis = apis,
        throttle = LoginThrottle(),
        scope = scope,
        onLoggedOut = {
            sync.stop()
            streams.stopAll()
            monitoringImpl.clear()
        },
    )

    private val monitoringImpl: MonitoringRepositoryImpl = MonitoringRepositoryImpl(apis, { sessionManager.session }, snapshotCache, scope)
    private val realtimeClient = RealtimeClient(httpClient, scope, onUnauthorized = { sessionManager.onUnauthorized() })

    override val network: NetworkMonitor = AndroidNetworkMonitor(appContext)
    private val sync: SyncCoordinator = SyncCoordinator(monitoringImpl, realtimeClient, network, scope)

    override val auth: AuthRepository = sessionManager
    override val monitoring: MonitoringRepository = monitoringImpl
    override val realtime: RealtimeRepository = realtimeClient
    override val settings: SettingsRepository = SettingsStore(appContext.settingsDataStore)
    override val webRtc: WebRtcEngine by lazy { WebRtcEngine(appContext) }
    override val streams: CameraStreamManager = CameraStreamManager(monitoringImpl, { webRtc }, scope)

    override val login = LoginUseCase(sessionManager)
    override val testServer = TestServerUseCase(sessionManager)
    override val acknowledgeAlarm = AcknowledgeAlarmUseCase(monitoringImpl) { sessionManager.session }
    override val setArmingMode = SetArmingModeUseCase(monitoringImpl) { sessionManager.session }
    override val observeDashboard = ObserveDashboardUseCase(monitoringImpl)

    @Volatile private var foreground = false

    /** Synchronizacja (WebSocket, odświeżanie) działa tylko przy aktywnej sesji i aplikacji na pierwszym planie. */
    fun start() {
        scope.launch { sessionManager.restore() }
        scope.launch {
            sessionManager.state.collectLatest { state ->
                if (state is SessionState.Active) {
                    monitoringImpl.loadCached(state.session.serverUrl)
                    if (foreground) sync.start(state.session)
                    launch { sessionManager.validate() }
                }
            }
        }
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                foreground = true
                sessionManager.session?.let { if (!it.isExpired()) sync.start(it) else scope.launch { sessionManager.validate() } }
            }

            override fun onStop(owner: LifecycleOwner) {
                foreground = false
                sync.stop()
                streams.stopAll()
            }
        })
    }
}
