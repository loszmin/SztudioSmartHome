package pl.sztudio.smarthome.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import pl.sztudio.smarthome.data.local.NetworkMonitor
import pl.sztudio.smarthome.data.webrtc.CameraStreamController
import pl.sztudio.smarthome.data.webrtc.CameraStreamManager
import pl.sztudio.smarthome.data.webrtc.PeerSessionFactory
import pl.sztudio.smarthome.di.AppDependencies
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.domain.repository.StreamSignaling
import pl.sztudio.smarthome.domain.usecase.AcknowledgeAlarmUseCase
import pl.sztudio.smarthome.domain.usecase.LoginUseCase
import pl.sztudio.smarthome.domain.usecase.ObserveDashboardUseCase
import pl.sztudio.smarthome.domain.usecase.SetArmingModeUseCase
import pl.sztudio.smarthome.domain.usecase.TestServerUseCase
import pl.sztudio.smarthome.presentation.LocalAppDependencies
import pl.sztudio.smarthome.presentation.cameras.LocalVideoRenderer
import pl.sztudio.smarthome.presentation.cameras.VideoRenderer
import pl.sztudio.smarthome.presentation.theme.SztudioTheme
import pl.sztudio.smarthome.testutil.FakeAuth
import pl.sztudio.smarthome.testutil.FakeMonitoring
import pl.sztudio.smarthome.testutil.FakeRealtime
import pl.sztudio.smarthome.testutil.FakeSettings

class FakeNetwork(online: Boolean = true) : NetworkMonitor {
    override val isOnline = MutableStateFlow(online)
}

/** Zależności dla testów interfejsu – bez sieci i bez bibliotek natywnych WebRTC. */
class FakeDependencies(
    override val monitoring: FakeMonitoring = FakeMonitoring(),
    override val auth: FakeAuth = FakeAuth(),
    override val network: FakeNetwork = FakeNetwork(),
) : AppDependencies {
    val startedStreams = mutableListOf<String>()
    override val realtime = FakeRealtime()
    override val settings = FakeSettings()
    override val webRtc = null
    override val streams = CameraStreamManager(StreamSignaling { id, _ -> startedStreams += id; error("brak serwera") }, { PeerSessionFactory { error("brak WebRTC") } }, CoroutineScope(SupervisorJob() + Dispatchers.Unconfined))
    override val login = LoginUseCase(auth)
    override val testServer = TestServerUseCase(auth)
    override val acknowledgeAlarm = AcknowledgeAlarmUseCase(monitoring) { (auth.state.value as? SessionState.Active)?.session }
    override val setArmingMode = SetArmingModeUseCase(monitoring) { (auth.state.value as? SessionState.Active)?.session }
    override val observeDashboard = ObserveDashboardUseCase(monitoring)
}

/** Zastępczy renderer: zamiast powierzchni WebRTC rysuje prostokąt z tagiem kamery. */
val FakeVideoRenderer = VideoRenderer { controller: CameraStreamController, modifier: Modifier ->
    Box(modifier.background(Color.DarkGray).testTag("video-${controller.cameraId}"))
}

@Composable
fun TestApp(dependencies: FakeDependencies, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalAppDependencies provides dependencies, LocalVideoRenderer provides FakeVideoRenderer) {
        SztudioTheme(content)
    }
}
