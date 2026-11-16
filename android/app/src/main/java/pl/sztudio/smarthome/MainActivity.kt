package pl.sztudio.smarthome

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.domain.repository.AppSettings
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.presentation.LocalAppDependencies
import pl.sztudio.smarthome.presentation.navigation.SztudioRoot
import pl.sztudio.smarthome.presentation.theme.LocalReduceMotion
import pl.sztudio.smarthome.presentation.theme.SztudioTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val dependencies = (application as SztudioApp).container
        // Systemowy ekran startowy zostaje, dopóki sesja nie zostanie odczytana z magazynu.
        installSplashScreen().setKeepOnScreenCondition { dependencies.auth.state.value == SessionState.Loading }
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        setContent {
            val settings by dependencies.settings.settings.collectAsStateWithLifecycle(AppSettings())
            CompositionLocalProvider(LocalAppDependencies provides dependencies, LocalReduceMotion provides settings.reduceMotion) {
                SztudioTheme { SztudioRoot() }
            }
        }
    }
}
