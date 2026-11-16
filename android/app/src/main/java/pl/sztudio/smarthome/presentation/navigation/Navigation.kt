package pl.sztudio.smarthome.presentation.navigation

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Sensors
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import pl.sztudio.smarthome.domain.model.AlarmStatus
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.presentation.LocalAppDependencies
import pl.sztudio.smarthome.presentation.alarms.AlarmsScreen
import pl.sztudio.smarthome.presentation.cameras.CamerasScreen
import pl.sztudio.smarthome.presentation.cameras.FullscreenCameraScreen
import pl.sztudio.smarthome.presentation.components.SztudioLogo
import pl.sztudio.smarthome.presentation.dashboard.DashboardScreen
import pl.sztudio.smarthome.presentation.diagnostics.DiagnosticsScreen
import pl.sztudio.smarthome.presentation.history.HistoryScreen
import pl.sztudio.smarthome.presentation.login.LoginScreen
import pl.sztudio.smarthome.presentation.more.AboutScreen
import pl.sztudio.smarthome.presentation.more.CaHelpScreen
import pl.sztudio.smarthome.presentation.more.MoreScreen
import pl.sztudio.smarthome.presentation.sensors.SensorsScreen
import pl.sztudio.smarthome.presentation.settings.SettingsScreen
import pl.sztudio.smarthome.presentation.theme.Sz

object Routes {
    const val DASHBOARD = "dashboard"
    const val CAMERAS = "cameras"
    const val ALARMS = "alarms"
    const val SENSORS = "sensors"
    const val MORE = "more"
    const val HISTORY = "history"
    const val DIAGNOSTICS = "diagnostics"
    const val SETTINGS = "settings"
    const val ABOUT = "about"
    const val CA_HELP = "ca-help"
    const val CAMERA = "camera/{id}"
    fun camera(id: String) = "camera/$id"
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab(Routes.DASHBOARD, "Start", Icons.Outlined.Dashboard),
    Tab(Routes.CAMERAS, "Kamery", Icons.Outlined.Videocam),
    Tab(Routes.ALARMS, "Alarmy", Icons.Outlined.NotificationsActive),
    Tab(Routes.SENSORS, "Czujniki", Icons.Outlined.Sensors),
    Tab(Routes.MORE, "Więcej", Icons.Outlined.Menu),
)

private val MORE_ROUTES = setOf(Routes.MORE, Routes.HISTORY, Routes.DIAGNOSTICS, Routes.SETTINGS, Routes.ABOUT, Routes.CA_HELP)

/** Główny przełącznik: ekran startowy → logowanie → aplikacja, zależnie od stanu sesji. */
@Composable
fun SztudioRoot() {
    val auth = LocalAppDependencies.current.auth
    val session by auth.state.collectAsStateWithLifecycle()
    when (val state = session) {
        SessionState.Loading -> StartupScreen()
        is SessionState.LoggedOut -> LoggedOutNavigation(state)
        is SessionState.Active -> MainNavigation()
    }
}

@Composable
fun StartupScreen() {
    Box(Modifier.fillMaxSize().background(Sz.Midnight).testTag("startup"), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            SztudioLogo(markSize = 64.dp, tagline = true, large = true)
            Spacer(Modifier.height(32.dp))
            LinearProgressIndicator(color = Sz.Blue, trackColor = Sz.Line, modifier = Modifier.width(160.dp))
        }
    }
}

@Composable
private fun LoggedOutNavigation(state: SessionState.LoggedOut) {
    val nav = rememberNavController()
    NavHost(nav, startDestination = "login") {
        composable("login") { LoginScreen(state.reason, onShowCaHelp = { nav.navigate(Routes.CA_HELP) }) }
        composable(Routes.CA_HELP) { CaHelpScreen(onBack = { nav.popBackStack() }) }
    }
}

@Composable
fun MainNavigation(nav: NavHostController = rememberNavController()) {
    val monitoring = LocalAppDependencies.current.monitoring
    val alarms by monitoring.alarms.collectAsStateWithLifecycle()
    val activeAlarms = alarms.data?.count { it.status == AlarmStatus.ACTIVE } ?: 0
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val fullscreen = route == Routes.CAMERA

    Scaffold(
        containerColor = Sz.Midnight,
        bottomBar = {
            if (!fullscreen) {
                NavigationBar(containerColor = Sz.Deep, tonalElevation = 0.dp) {
                    TABS.forEach { tab ->
                        val selected = entry?.destination?.hierarchy?.any { it.route == tab.route } == true ||
                            (tab.route == Routes.MORE && route in MORE_ROUTES)
                        NavigationBarItem(
                            selected = selected,
                            onClick = { nav.navigateToTab(tab.route) },
                            icon = {
                                if (tab.route == Routes.ALARMS && activeAlarms > 0) {
                                    BadgedBox(badge = { Badge(containerColor = Sz.Danger, modifier = Modifier.testTag("alarm-badge")) { Text("$activeAlarms") } }) { Icon(tab.icon, contentDescription = null) }
                                } else {
                                    Icon(tab.icon, contentDescription = null)
                                }
                            },
                            label = { Text(tab.label, fontSize = 11.sp) },
                            modifier = Modifier.testTag("tab-${tab.route}"),
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Sz.BlueSoft,
                                selectedTextColor = Sz.BlueSoft,
                                indicatorColor = Sz.Blue.copy(alpha = 0.15f),
                                unselectedIconColor = Sz.Muted,
                                unselectedTextColor = Sz.Muted,
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            nav,
            startDestination = Routes.DASHBOARD,
            modifier = Modifier.padding(padding),
            enterTransition = { fadeIn(tween(150)) },
            exitTransition = { fadeOut(tween(150)) },
        ) {
            composable(Routes.DASHBOARD) {
                DashboardScreen(
                    onOpenCameras = { nav.navigateToTab(Routes.CAMERAS) },
                    onOpenCamera = { nav.navigate(Routes.camera(it)) },
                    onOpenAlarms = { nav.navigateToTab(Routes.ALARMS) },
                    onOpenSensors = { nav.navigateToTab(Routes.SENSORS) },
                    onOpenHistory = { nav.navigate(Routes.HISTORY) },
                    onOpenDiagnostics = { nav.navigate(Routes.DIAGNOSTICS) },
                    onShowCaHelp = { nav.navigate(Routes.CA_HELP) },
                )
            }
            composable(Routes.CAMERAS) { CamerasScreen(onOpenFullscreen = { nav.navigate(Routes.camera(it)) }) }
            composable(Routes.CAMERA, arguments = listOf(navArgument("id") { type = NavType.StringType })) { backStack ->
                FullscreenCameraScreen(cameraId = backStack.arguments?.getString("id").orEmpty(), onBack = { nav.popBackStack() })
            }
            composable(Routes.ALARMS) { AlarmsScreen() }
            composable(Routes.SENSORS) { SensorsScreen() }
            composable(Routes.MORE) { MoreScreen(onNavigate = { nav.navigate(it) }) }
            composable(Routes.HISTORY) { HistoryScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.DIAGNOSTICS) { DiagnosticsScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.SETTINGS) { SettingsScreen(onBack = { nav.popBackStack() }, onShowCaHelp = { nav.navigate(Routes.CA_HELP) }) }
            composable(Routes.ABOUT) { AboutScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.CA_HELP) { CaHelpScreen(onBack = { nav.popBackStack() }) }
        }
    }
}

/** Przejście między zakładkami: bez duplikatów na stosie, z zachowaniem stanu zakładki. Wstecz wraca do Startu. */
fun NavHostController.navigateToTab(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

@Composable
fun ScreenTitle(title: String, modifier: Modifier = Modifier) =
    Text(title, style = androidx.compose.material3.MaterialTheme.typography.headlineSmall, color = Sz.Ink, modifier = modifier)

internal val ScreenSpacing = Arrangement.spacedBy(Sz.gap)
