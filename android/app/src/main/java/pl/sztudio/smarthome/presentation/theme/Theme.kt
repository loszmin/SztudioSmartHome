package pl.sztudio.smarthome.presentation.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Paleta Sztudio Smart Home (wspólna z panelem WWW). */
object Sz {
    val Midnight = Color(0xFF080D18)
    val Deep = Color(0xFF0B1322)
    val Navy = Color(0xFF111C30)
    val Raised = Color(0xFF17243C)
    val Line = Color(0xFF1F2D47)
    val LineStrong = Color(0xFF2B3C5C)
    val Blue = Color(0xFF2589E8)
    val BlueSoft = Color(0xFF5AA9F2)
    val Silver = Color(0xFFB8C5D6)
    val Ink = Color(0xFFE9EEF6)
    val Muted = Color(0xFF8494AB)
    val Success = Color(0xFF27C37A)
    val Warning = Color(0xFFF59E0B)
    val Danger = Color(0xFFEF4444)

    val gutter = 16.dp
    val gap = 12.dp
    val radius = 14.dp
}

enum class Tone(val color: Color) {
    Success(Sz.Success), Warning(Sz.Warning), Danger(Sz.Danger), Primary(Sz.BlueSoft), Neutral(Sz.Muted)
}

/** Preferencja „ogranicz animacje” z ustawień aplikacji. */
val LocalReduceMotion = staticCompositionLocalOf { false }

private val colors = darkColorScheme(
    primary = Sz.Blue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF123A63),
    onPrimaryContainer = Sz.Ink,
    secondary = Sz.Silver,
    onSecondary = Sz.Midnight,
    background = Sz.Midnight,
    onBackground = Sz.Ink,
    surface = Sz.Navy,
    onSurface = Sz.Ink,
    surfaceVariant = Sz.Raised,
    onSurfaceVariant = Sz.Silver,
    surfaceContainer = Sz.Navy,
    surfaceContainerHigh = Sz.Raised,
    surfaceContainerLow = Sz.Deep,
    outline = Sz.LineStrong,
    outlineVariant = Sz.Line,
    error = Sz.Danger,
    onError = Color.White,
)

private val base = Typography()
private val typography = Typography(
    headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.SemiBold, fontSize = 22.sp),
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.SemiBold, fontSize = 20.sp),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    titleSmall = base.titleSmall.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
    bodyMedium = base.bodyMedium.copy(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = base.bodySmall.copy(fontSize = 12.sp, lineHeight = 17.sp, color = Sz.Muted),
    labelSmall = base.labelSmall.copy(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.9.sp),
)

/** Etykieta wielkimi literami – nagłówki kafli, jak w panelu WWW. */
val CapsLabel = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.9.sp, color = Sz.Muted)
val Mono = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = Sz.Silver)

@Composable
fun SztudioTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
