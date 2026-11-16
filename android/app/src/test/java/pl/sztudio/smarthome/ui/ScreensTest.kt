package pl.sztudio.smarthome.ui

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performScrollTo
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.model.StreamRegistration
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.presentation.alarms.AlarmsScreen
import pl.sztudio.smarthome.presentation.cameras.CameraTile
import pl.sztudio.smarthome.presentation.components.StaleBanner
import pl.sztudio.smarthome.presentation.login.LoginContent
import pl.sztudio.smarthome.presentation.login.LoginUiState
import pl.sztudio.smarthome.testutil.alarm
import pl.sztudio.smarthome.testutil.camera
import pl.sztudio.smarthome.testutil.session
import pl.sztudio.smarthome.domain.model.Role
import java.time.Instant

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], application = android.app.Application::class, qualifiers = "w411dp-h914dp")
class ScreensTest {
    @get:Rule val compose = createComposeRule()

    private fun stateOf(tag: String) = SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, tag)

    @Test
    fun `ekran logowania - instrukcja CA przy niezaufanym certyfikacie`() {
        var caHelp = 0
        val deps = FakeDependencies()
        compose.setContent {
            TestApp(deps) {
                LoginContent(
                    LoginUiState(server = "https://192.168.1.10", error = AppError.UntrustedCertificate),
                    reason = AppError.SessionExpired, {}, {}, {}, {}, {}, onShowCaHelp = { caHelp++ },
                )
            }
        }
        compose.onNodeWithText("Sesja wygasła. Zaloguj się ponownie.").assertIsDisplayed()
        compose.onNodeWithText("Jak zainstalować certyfikat CA Sztudio").performScrollTo().performClick()
        assertEquals(1, caHelp)
        compose.onNodeWithText("Zaloguj").assertIsNotEnabled()
    }

    @Test
    fun `ekran logowania - wpisywanie danych`() {
        var state by mutableStateOf(LoginUiState())
        var submitted = 0
        compose.setContent {
            TestApp(FakeDependencies()) {
                LoginContent(state, null, { state = state.copy(server = it) }, { state = state.copy(username = it) }, { state = state.copy(password = it) }, {}, { submitted++ }, {})
            }
        }
        compose.onNodeWithText("Zaloguj").assertIsNotEnabled()
        compose.onNodeWithTag("server").performTextInput("192.168.1.10")
        compose.onNodeWithTag("username").performTextInput("admin")
        compose.onNodeWithTag("password").performTextInput("haslo")
        assertEquals(LoginUiState(server = "192.168.1.10", username = "admin", password = "haslo"), state)
        compose.onNodeWithText("Zaloguj").performScrollTo().performClick()
        assertEquals(1, submitted)
    }

    @Test
    fun `alarmy - potwierdzenie wymaga zgody w oknie dialogowym`() {
        val deps = FakeDependencies()
        deps.monitoring.alarms.value = Loadable.success(listOf(alarm("a1")))
        compose.setContent { TestApp(deps) { AlarmsScreen() } }

        compose.onNodeWithTag("ack-a1").performClick()
        compose.onNodeWithText("Potwierdzić alarm?").assertIsDisplayed()
        assertTrue(deps.monitoring.acknowledged.isEmpty())
        compose.onNodeWithText("Potwierdź alarm").performClick()
        compose.waitForIdle()
        assertEquals(listOf("a1"), deps.monitoring.acknowledged)
        compose.onNodeWithText("Brak aktywnych alarmów").assertIsDisplayed()
    }

    @Test
    fun `alarmy - konto tylko do odczytu nie widzi przyciskow zmiany stanu`() {
        val deps = FakeDependencies(auth = pl.sztudio.smarthome.testutil.FakeAuth(SessionState.Active(session(Role.VIEWER))))
        deps.monitoring.alarms.value = Loadable.success(listOf(alarm("a1")))
        compose.setContent { TestApp(deps) { AlarmsScreen() } }
        compose.onNodeWithTag("ack-a1").assertDoesNotExist()
        compose.onNodeWithText("Konto tylko do odczytu", substring = true).assertIsDisplayed()
    }

    @Test
    fun `kafel kamery - strumien tylko dla kamery mogacej nadawac`() {
        val deps = FakeDependencies()
        compose.setContent {
            TestApp(deps) {
                androidx.compose.foundation.layout.Column {
                    CameraTile(camera("on"))
                    CameraTile(camera("off", ConnectionStatus.OFFLINE))
                    CameraTile(camera("none", stream = StreamRegistration.NOT_CONFIGURED))
                    CameraTile(camera("disabled", enabled = false))
                }
            }
        }
        compose.onNodeWithTag("video-on").assertExists()
        listOf("off", "none", "disabled").forEach { compose.onNodeWithTag("video-$it").assertDoesNotExist() }
        compose.onNode(stateOf("offline")).assertExists()
        compose.onNodeWithText("Kamera offline").assertExists()
        compose.onNodeWithText("Brak źródła obrazu").assertExists()
        compose.onNodeWithText("Kamera wyłączona").assertExists()
    }

    @Test
    fun `dane nieaktualne sa wyraznie oznaczone`() {
        compose.setContent { TestApp(FakeDependencies()) { StaleBanner(Instant.parse("2026-11-15T10:00:00Z"), AppError.Unreachable) } }
        compose.onNodeWithText("Dane nieaktualne").assertIsDisplayed()
        compose.onNodeWithText("Sztudio Core jest nieosiągalny", substring = true).assertIsDisplayed()
    }
}
