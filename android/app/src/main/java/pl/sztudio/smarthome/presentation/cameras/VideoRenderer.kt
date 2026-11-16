package pl.sztudio.smarthome.presentation.cameras

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import pl.sztudio.smarthome.data.webrtc.CameraStreamController
import pl.sztudio.smarthome.presentation.LocalAppDependencies

/**
 * Powierzchnia obrazu kamery. Domyślnie natywny renderer WebRTC; testy interfejsu (bez bibliotek natywnych)
 * podstawiają własną implementację.
 */
fun interface VideoRenderer {
    @Composable
    fun Render(controller: CameraStreamController, modifier: Modifier)
}

val LocalVideoRenderer = staticCompositionLocalOf<VideoRenderer> { WebRtcVideoRenderer }

/**
 * Natywny renderer: tworzy `SurfaceViewRenderer`, uruchamia strumień, gdy ekran jest widoczny (ON_START),
 * zatrzymuje go w tle (ON_STOP) i zwalnia wszystkie zasoby po zniknięciu kafla z ekranu.
 */
object WebRtcVideoRenderer : VideoRenderer {
    @Composable
    override fun Render(controller: CameraStreamController, modifier: Modifier) {
        val engine = LocalAppDependencies.current.webRtc ?: return
        val context = LocalContext.current
        val renderer = remember(controller) { SurfaceViewRenderer(context) }

        // Kolejność efektów ma znaczenie: przy usuwaniu najpierw zatrzymujemy strumień, potem zwalniamy renderer.
        DisposableEffect(renderer) {
            renderer.init(engine.eglBase.eglBaseContext, null)
            renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
            renderer.setEnableHardwareScaler(true)
            onDispose { renderer.release() }
        }

        val lifecycle = LocalLifecycleOwner.current.lifecycle
        DisposableEffect(lifecycle, controller, renderer) {
            val observer = LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_START -> controller.start(renderer)
                    Lifecycle.Event.ON_STOP -> controller.stop()
                    else -> Unit
                }
            }
            lifecycle.addObserver(observer)
            onDispose {
                lifecycle.removeObserver(observer)
                controller.stop()
            }
        }

        AndroidView(factory = { renderer }, modifier = modifier)
    }
}
