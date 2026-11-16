package pl.sztudio.smarthome.presentation.cameras

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FullscreenExit
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.domain.repository.AppSettings
import pl.sztudio.smarthome.presentation.LocalAppDependencies
import pl.sztudio.smarthome.presentation.components.EmptyBlock
import pl.sztudio.smarthome.presentation.components.LoadingBlock

/**
 * Pełny ekran jednej kamery. Siatka jest wtedy usunięta z kompozycji, więc jej strumienie są zamykane –
 * aktywny pozostaje tylko ten jeden. Obrót ekranu nie przerywa obrazu (Activity obsługuje zmianę konfiguracji).
 */
@Composable
fun FullscreenCameraScreen(cameraId: String, onBack: () -> Unit) {
    val dependencies = LocalAppDependencies.current
    val cameras by dependencies.monitoring.cameras.collectAsStateWithLifecycle()
    val settings by dependencies.settings.settings.collectAsStateWithLifecycle(AppSettings())
    val camera = cameras.data?.firstOrNull { it.id == cameraId }
    val view = LocalView.current

    DisposableEffect(view, settings.keepScreenOnDuringPreview) {
        val window = (view.context as? Activity)?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        controller?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller?.hide(WindowInsetsCompat.Type.systemBars())
        view.keepScreenOn = settings.keepScreenOnDuringPreview
        onDispose {
            controller?.show(WindowInsetsCompat.Type.systemBars())
            view.keepScreenOn = false
        }
    }
    BackHandler(onBack = onBack)

    Box(Modifier.fillMaxSize().background(Color.Black).testTag("fullscreen")) {
        when {
            camera != null -> CameraTile(camera, fill = true, modifier = Modifier.safeDrawingPadding())
            cameras.data == null -> LoadingBlock()
            else -> EmptyBlock("Nie znaleziono kamery", "Kamera mogła zostać usunięta w panelu WWW.")
        }
        IconButton(onClick = onBack, modifier = Modifier.align(Alignment.BottomEnd).safeDrawingPadding().padding(8.dp)) {
            Icon(Icons.Outlined.FullscreenExit, contentDescription = "Zamknij pełny ekran", tint = Color.White)
        }
    }
}

private val Int.dp get() = androidx.compose.ui.unit.Dp(this.toFloat())
