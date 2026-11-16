package pl.sztudio.smarthome.ui

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.performClick
import androidx.navigation.compose.rememberNavController
import androidx.navigation.NavHostController
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.presentation.navigation.MainNavigation
import pl.sztudio.smarthome.presentation.navigation.Routes
import pl.sztudio.smarthome.presentation.navigation.SztudioRoot
import pl.sztudio.smarthome.testutil.FakeAuth
import pl.sztudio.smarthome.testutil.alarm
import pl.sztudio.smarthome.testutil.camera

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], application = android.app.Application::class, qualifiers = "w411dp-h914dp")
class NavigationTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `dolna nawigacja, ekrany Wiecej i przycisk Wstecz`() {
        val deps = FakeDependencies()
        deps.monitoring.cameras.value = Loadable.success(listOf(camera("c1"), camera("c2", ConnectionStatus.OFFLINE)))
        deps.monitoring.alarms.value = Loadable.success(listOf(alarm("a1")))
        lateinit var nav: NavHostController
        compose.setContent { TestApp(deps) { nav = rememberNavController(); MainNavigation(nav) } }

        compose.onNodeWithTag("dashboard").assertIsDisplayed()
        compose.onNodeWithTag("alarm-badge", useUnmergedTree = true).assertExists() // odznaka aktywnych alarmów na zakładce

        compose.onNodeWithTag("tab-cameras").performClick()
        compose.onNodeWithTag("camera-grid").assertIsDisplayed()
        compose.onNodeWithTag("tab-alarms").performClick()
        compose.onNodeWithTag("alarms").assertIsDisplayed()
        compose.onNodeWithTag("tab-sensors").performClick()
        compose.onAllNodesWithText("Czujniki").assertCountEquals(2) // zakładka i tytuł ekranu

        compose.onNodeWithTag("tab-more").performClick()
        compose.onNodeWithText("Diagnostyka").performClick()
        compose.onNodeWithTag("diagnostics").assertIsDisplayed()
        compose.onNodeWithContentDescriptionSafe("Wstecz")
        compose.runOnIdle { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.onNodeWithTag("more-menu").assertIsDisplayed()

        // Wstecz z zakładki wraca na Start (zakładki nie piętrzą się na stosie).
        compose.runOnIdle { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
        assertEquals(Routes.DASHBOARD, nav.currentDestination?.route)
    }

    @Test
    fun `pelny ekran kamery i powrot`() {
        val deps = FakeDependencies()
        deps.monitoring.cameras.value = Loadable.success(listOf(camera("c1")))
        lateinit var nav: NavHostController
        compose.setContent { TestApp(deps) { nav = rememberNavController(); MainNavigation(nav) } }
        compose.runOnIdle { nav.navigate(Routes.camera("c1")) }
        compose.onNodeWithTag("fullscreen").assertIsDisplayed()
        compose.onNodeWithTag("tab-cameras").assertDoesNotExist() // bez dolnego paska
        compose.onNodeWithTag("video-c1").assertExists()
        compose.runOnIdle { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
        assertEquals(Routes.DASHBOARD, nav.currentDestination?.route)
    }

    @Test
    fun `stan sesji decyduje o ekranie - start, logowanie, aplikacja, wygasniecie`() {
        val auth = FakeAuth(SessionState.Loading)
        val deps = FakeDependencies(auth = auth)
        compose.setContent { TestApp(deps) { SztudioRoot() } }
        compose.onNodeWithTag("startup").assertIsDisplayed()
        compose.onNodeWithText("YOUR HOME. YOUR SECURITY.").assertExists()

        auth.state.value = SessionState.LoggedOut()
        compose.onNodeWithText("Logowanie do Sztudio Core").assertIsDisplayed()

        auth.state.value = SessionState.Active(pl.sztudio.smarthome.testutil.session())
        compose.onNodeWithTag("dashboard").assertIsDisplayed()

        auth.state.value = SessionState.LoggedOut(AppError.SessionExpired)
        compose.onNodeWithText("Sesja wygasła. Zaloguj się ponownie.").assertIsDisplayed()
    }

    @Test
    fun `brak sieci i brak polaczenia z Core sa sygnalizowane`() {
        val deps = FakeDependencies(network = FakeNetwork(online = false))
        compose.setContent { TestApp(deps) { MainNavigation() } }
        compose.onNodeWithText("Brak sieci").assertIsDisplayed()
        deps.network.isOnline.value = true
        deps.monitoring.status.value = Loadable<pl.sztudio.smarthome.domain.model.CoreStatus>().copy(error = AppError.Unreachable)
        compose.onNodeWithText("Brak połączenia z Sztudio Core").assertIsDisplayed()
    }

    private fun androidx.compose.ui.test.junit4.ComposeTestRule.onNodeWithContentDescriptionSafe(text: String) =
        onNode(androidx.compose.ui.test.hasContentDescription(text)).assertExists()
}
