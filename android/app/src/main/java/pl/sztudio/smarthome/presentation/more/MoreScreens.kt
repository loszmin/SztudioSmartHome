package pl.sztudio.smarthome.presentation.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.MonitorHeart
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.BuildConfig
import pl.sztudio.smarthome.presentation.LocalAppDependencies
import pl.sztudio.smarthome.presentation.components.CardHeader
import pl.sztudio.smarthome.presentation.components.Divider
import pl.sztudio.smarthome.presentation.components.InfoRow
import pl.sztudio.smarthome.presentation.components.ScreenScaffold
import pl.sztudio.smarthome.presentation.components.SzCard
import pl.sztudio.smarthome.presentation.components.SztudioLogo
import pl.sztudio.smarthome.presentation.navigation.Routes
import pl.sztudio.smarthome.presentation.theme.Sz

@Composable
fun MoreScreen(onNavigate: (String) -> Unit) {
    ScreenScaffold("Więcej") {
        Column(Modifier.fillMaxSize().padding(Sz.gutter), verticalArrangement = Arrangement.spacedBy(Sz.gap)) {
            SztudioLogo(tagline = true, modifier = Modifier.padding(vertical = 8.dp))
            SzCard(Modifier.testTag("more-menu")) {
                listOf(
                    Triple(Routes.HISTORY, "Historia", Icons.Outlined.History),
                    Triple(Routes.DIAGNOSTICS, "Diagnostyka", Icons.Outlined.MonitorHeart),
                    Triple(Routes.SETTINGS, "Ustawienia", Icons.Outlined.Settings),
                    Triple(Routes.ABOUT, "Informacje o aplikacji", Icons.Outlined.Info),
                ).forEachIndexed { index, (route, label, icon) ->
                    if (index > 0) Divider()
                    MenuRow(label, icon) { onNavigate(route) }
                }
            }
        }
    }
}

@Composable
private fun MenuRow(label: String, icon: ImageVector, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onClick).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(icon, contentDescription = null, tint = Sz.BlueSoft, modifier = Modifier.size(20.dp))
        Text(label, color = Sz.Ink, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = Sz.Muted)
    }
}

@Composable
fun AboutScreen(onBack: () -> Unit) {
    val status by LocalAppDependencies.current.monitoring.status.collectAsStateWithLifecycle()
    ScreenScaffold("Informacje o aplikacji", onBack = onBack) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Sz.gutter), verticalArrangement = Arrangement.spacedBy(Sz.gap)) {
            SztudioLogo(markSize = 56.dp, tagline = true, large = true, modifier = Modifier.padding(vertical = 12.dp))
            SzCard {
                Column(Modifier.padding(16.dp)) {
                    InfoRow("Aplikacja", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                    InfoRow("Sztudio Core", status.data?.version ?: "—")
                    InfoRow("Podgląd kamer", "WebRTC (natywnie)")
                }
            }
            SzCard {
                CardHeader("Funkcje niedostępne w tej wersji", Icons.Outlined.Info)
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(
                        "Powiadomienia push w tle – Sztudio Core ich nie wysyła; alerty widać przy otwartej aplikacji.",
                        "Odświeżanie sesji – Core nie wydaje tokenów odświeżania; po wygaśnięciu trzeba zalogować się ponownie.",
                        "Dźwięk z kamer – podgląd obejmuje wyłącznie obraz.",
                        "Dodawanie i edycja kamer, rejestratorów i czujników – dostępne w panelu WWW.",
                        "Nagrania, PTZ – brak obsługi w Sztudio Core.",
                    ).forEach { Text("• $it", color = Sz.Silver, fontSize = 13.sp) }
                }
            }
            Text("Prywatny system monitoringu jednego domu.", color = Sz.Muted, fontSize = 12.sp)
        }
    }
}

@Composable
fun CaHelpScreen(onBack: () -> Unit) {
    ScreenScaffold("Certyfikat CA", onBack = onBack, showConnection = false) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Sz.gutter).testTag("ca-help"), verticalArrangement = Arrangement.spacedBy(Sz.gap)) {
            SzCard {
                CardHeader("Dlaczego to potrzebne", Icons.Outlined.VerifiedUser)
                Text(
                    "Sztudio Core działa w sieci domowej z certyfikatem HTTPS wystawionym przez lokalny urząd certyfikacji (CA) utworzony przy instalacji. " +
                        "Telefon musi temu urzędowi zaufać. Aplikacja nigdy nie wyłącza sprawdzania certyfikatu – bez instalacji CA połączenie zostanie odrzucone.",
                    color = Sz.Silver, fontSize = 13.sp, modifier = Modifier.padding(16.dp),
                )
            }
            SzCard {
                CardHeader("Instalacja na Androidzie 11 i nowszym", Icons.Outlined.Settings)
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(
                        "W przeglądarce telefonu otwórz http://ADRES-SERWERA/sztudio-ca.crt – plik zostanie pobrany.",
                        "Porównaj odcisk SHA-256 z wartością w logach serwera (docker compose logs certs). Jeżeli się różni – nie instaluj.",
                        "Ustawienia → Bezpieczeństwo i prywatność → Więcej ustawień zabezpieczeń → Szyfrowanie i dane logowania → Zainstaluj certyfikat → Certyfikat CA.",
                        "Wybierz pobrany plik sztudio-ca.crt i potwierdź ostrzeżenie systemu.",
                        "Wróć do aplikacji i użyj „Testuj połączenie”.",
                    ).forEachIndexed { index, step -> Text("${index + 1}. $step", color = Sz.Ink, fontSize = 13.sp) }
                    Text("Nazwy menu różnią się między producentami – szukaj w ustawieniach hasła „certyfikat CA”. Android pokaże stałe powiadomienie „Sieć może być monitorowana” – to standardowy komunikat dla certyfikatów dodanych przez użytkownika.", color = Sz.Muted, fontSize = 12.sp)
                }
            }
            SzCard {
                CardHeader("Nadal brak połączenia?", Icons.Outlined.Info)
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("• „Certyfikat nie obejmuje tego adresu” – użyj adresu z SZTUDIO_LAN_IP albo SZTUDIO_TLS_HOSTS.", color = Sz.Silver, fontSize = 13.sp)
                    Text("• Adres musi zaczynać się od https:// – połączenia nieszyfrowane są zablokowane.", color = Sz.Silver, fontSize = 13.sp)
                    Text("• Telefon musi być w tej samej sieci domowej co serwer.", color = Sz.Silver, fontSize = 13.sp)
                }
            }
        }
    }
}
