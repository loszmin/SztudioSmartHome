package pl.sztudio.smarthome.presentation.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.BuildConfig
import pl.sztudio.smarthome.core.Formatters
import pl.sztudio.smarthome.domain.model.Role
import pl.sztudio.smarthome.domain.repository.AppSettings
import pl.sztudio.smarthome.presentation.appViewModel
import pl.sztudio.smarthome.presentation.components.CardHeader
import pl.sztudio.smarthome.presentation.components.ConfirmDialog
import pl.sztudio.smarthome.presentation.components.InfoRow
import pl.sztudio.smarthome.presentation.components.ScreenScaffold
import pl.sztudio.smarthome.presentation.components.SzCard
import pl.sztudio.smarthome.presentation.theme.Sz

@Composable
fun SettingsScreen(onBack: () -> Unit, onShowCaHelp: () -> Unit) {
    val viewModel = appViewModel { SettingsViewModel(it.auth, it.settings) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    SettingsContent(state, onBack, onShowCaHelp, viewModel::testConnection, viewModel::updateSettings, viewModel::requestLogout, viewModel::logout)
}

@Composable
fun SettingsContent(
    state: SettingsUiState,
    onBack: () -> Unit,
    onShowCaHelp: () -> Unit,
    onTest: () -> Unit,
    onUpdate: ((AppSettings) -> AppSettings) -> Unit,
    onRequestLogout: (Boolean) -> Unit,
    onLogout: () -> Unit,
) {
    ScreenScaffold("Ustawienia", onBack = onBack) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Sz.gutter), verticalArrangement = Arrangement.spacedBy(Sz.gap)) {
            SzCard {
                CardHeader("Serwer Sztudio Core", Icons.Outlined.Dns)
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    InfoRow("Adres", state.session?.serverUrl ?: "—")
                    OutlinedButton(onClick = onTest, enabled = !state.testing) { Text(if (state.testing) "Sprawdzanie…" else "Testuj połączenie") }
                    state.testResult?.let { Text(it, color = if (state.testOk) Sz.Success else Sz.Danger, fontSize = 13.sp, modifier = Modifier.testTag("test-result")) }
                    Text("Zmiana serwera: wyloguj się i podaj nowy adres na ekranie logowania.", color = Sz.Muted, fontSize = 12.sp)
                }
            }
            SzCard {
                CardHeader("Sesja", Icons.Outlined.Person)
                Column(Modifier.padding(16.dp)) {
                    InfoRow("Użytkownik", state.session?.username ?: "—")
                    InfoRow("Uprawnienia", if (state.session?.role == Role.ADMIN) "administrator" else "tylko odczyt")
                    InfoRow("Ważna do", state.session?.expiresAt?.let { Formatters.dateTime(it) } ?: "—")
                    Text("Token jest zaszyfrowany kluczem w Android Keystore. Po wygaśnięciu sesji trzeba zalogować się ponownie – Sztudio Core nie odświeża tokenów.", color = Sz.Muted, fontSize = 12.sp)
                    TextButton(onClick = { onRequestLogout(true) }, modifier = Modifier.testTag("logout")) {
                        Icon(Icons.AutoMirrored.Outlined.Logout, contentDescription = null, tint = Sz.Danger)
                        Text("  Wyloguj", color = Sz.Danger)
                    }
                }
            }
            SzCard {
                CardHeader("Wygląd i podgląd", Icons.Outlined.Palette)
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Domyślny układ kamer", color = Sz.Ink)
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        listOf(1, 4, 6).forEachIndexed { index, layout ->
                            SegmentedButton(state.settings.defaultCameraLayout == layout, { onUpdate { it.copy(defaultCameraLayout = layout) } }, SegmentedButtonDefaults.itemShape(index, 3), label = { Text("$layout") })
                        }
                    }
                    ToggleRow("Nie wygaszaj ekranu podczas podglądu", state.settings.keepScreenOnDuringPreview) { value -> onUpdate { it.copy(keepScreenOnDuringPreview = value) } }
                    ToggleRow("Ogranicz animacje", state.settings.reduceMotion) { value -> onUpdate { it.copy(reduceMotion = value) } }
                    Text("Motyw: ciemny (Sztudio Midnight).", color = Sz.Muted, fontSize = 12.sp)
                }
            }
            SzCard {
                CardHeader("Bezpieczeństwo połączenia", Icons.Outlined.VerifiedUser)
                Column(Modifier.padding(16.dp)) {
                    Text("Aplikacja łączy się z Core wyłącznie przez HTTPS i ufa certyfikatom systemowym oraz zainstalowanemu przez Ciebie certyfikatowi CA Sztudio.", color = Sz.Silver, fontSize = 13.sp)
                    TextButton(onClick = onShowCaHelp) { Text("Instrukcja instalacji certyfikatu CA") }
                }
            }
            Text("Sztudio Smart Home ${BuildConfig.VERSION_NAME}", color = Sz.Muted, fontSize = 12.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        }
    }
    if (state.confirmLogout) {
        ConfirmDialog(
            "Wylogować?",
            "Token sesji i zapisany stan systemu zostaną usunięte z telefonu.",
            "Wyloguj",
            onConfirm = onLogout,
            onDismiss = { onRequestLogout(false) },
            destructive = true,
        )
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Sz.Ink, modifier = Modifier.weight(1f))
        Switch(checked, onChange)
    }
}
