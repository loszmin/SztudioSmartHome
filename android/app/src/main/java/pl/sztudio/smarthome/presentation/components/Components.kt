package pl.sztudio.smarthome.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.Formatters
import pl.sztudio.smarthome.presentation.theme.CapsLabel
import pl.sztudio.smarthome.presentation.theme.Sz
import pl.sztudio.smarthome.presentation.theme.Tone
import java.time.Instant

@Composable
fun SzCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(Sz.radius)
    Column(
        modifier
            .clip(shape)
            .background(Sz.Navy)
            .border(1.dp, Sz.Line, shape)
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier),
        content = content,
    )
}

@Composable
fun CardHeader(title: String, icon: ImageVector? = null, meta: String? = null, action: (@Composable () -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = Sz.BlueSoft, modifier = Modifier.size(18.dp))
        Text(title, style = androidx.compose.material3.MaterialTheme.typography.titleSmall, color = Sz.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (meta != null) Text(meta, fontSize = 12.sp, color = Sz.Muted)
        Spacer(Modifier.weight(1f))
        action?.invoke()
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(Sz.Line))
}

@Composable
fun StatusDot(tone: Tone, modifier: Modifier = Modifier) {
    Box(modifier.size(8.dp).clip(CircleShape).background(tone.color))
}

@Composable
fun Badge(text: String, tone: Tone, modifier: Modifier = Modifier, dot: Boolean = false) {
    val shape = RoundedCornerShape(6.dp)
    Row(
        modifier
            .clip(shape)
            .background(tone.color.copy(alpha = 0.12f))
            .border(1.dp, tone.color.copy(alpha = 0.3f), shape)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (dot) StatusDot(tone)
        Text(text, color = tone.color, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1)
    }
}

@Composable
fun CapsText(text: String, modifier: Modifier = Modifier) = Text(text.uppercase(), style = CapsLabel, modifier = modifier, maxLines = 1, overflow = TextOverflow.Ellipsis)

@Composable
fun LoadingBlock(modifier: Modifier = Modifier, label: String = "Ładowanie danych") {
    Box(modifier.fillMaxWidth().padding(32.dp).semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Sz.Blue, strokeWidth = 3.dp, modifier = Modifier.size(32.dp))
    }
}

@Composable
fun MessageBlock(
    icon: ImageVector,
    title: String,
    description: String? = null,
    tone: Tone = Tone.Neutral,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            Modifier.size(44.dp).clip(CircleShape).background(tone.color.copy(alpha = 0.1f)).border(1.dp, tone.color.copy(alpha = 0.3f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, tint = tone.color, modifier = Modifier.size(20.dp)) }
        Text(title, color = Sz.Ink, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
        if (description != null) Text(description, color = Sz.Muted, fontSize = 13.sp, textAlign = TextAlign.Center)
        if (action != null) {
            Spacer(Modifier.height(4.dp))
            action()
        }
    }
}

@Composable
fun EmptyBlock(title: String, description: String? = null, icon: ImageVector = Icons.Outlined.Inbox) =
    MessageBlock(icon, title, description)

/** Błąd pobierania danych; dla niezaufanego certyfikatu proponuje instrukcję instalacji CA. */
@Composable
fun ErrorBlock(error: AppError, onRetry: (() -> Unit)?, onShowCaHelp: (() -> Unit)? = null) {
    val certificate = error is AppError.UntrustedCertificate || error is AppError.CertificateHostMismatch
    MessageBlock(
        icon = if (certificate) Icons.Outlined.VerifiedUser else Icons.Outlined.CloudOff,
        title = if (certificate) "Połączenie niezaufane" else "Nie udało się pobrać danych",
        description = error.userMessage,
        tone = Tone.Danger,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (onRetry != null) {
                OutlinedButton(onClick = onRetry) {
                    Icon(Icons.Outlined.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Spróbuj ponownie")
                }
            }
            if (certificate && onShowCaHelp != null) TextButton(onClick = onShowCaHelp) { Text("Instrukcja certyfikatu") }
        }
    }
}

/** Informacja, że widoczne dane nie są aktualne – nigdy nie pokazujemy starych danych jako bieżących. */
@Composable
fun StaleBanner(updatedAt: Instant?, error: AppError?, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(10.dp)
    Row(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Sz.Warning.copy(alpha = 0.1f))
            .border(1.dp, Sz.Warning.copy(alpha = 0.3f), shape)
            .padding(horizontal = 12.dp, vertical = 10.dp)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Outlined.Schedule, contentDescription = null, tint = Sz.Warning, modifier = Modifier.size(18.dp))
        Column(Modifier.weight(1f)) {
            Text("Dane nieaktualne", color = Sz.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            val at = updatedAt?.let { "Ostatnia aktualizacja: ${Formatters.dateTime(it)}." } ?: "Brak potwierdzenia z serwera."
            Text(listOfNotNull(at, error?.userMessage).joinToString(" "), color = Sz.Silver, fontSize = 12.sp)
        }
    }
}

@Composable
fun ConfirmDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    destructive: Boolean = false,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Sz.Navy,
        title = { Text(title, color = Sz.Ink) },
        text = { Text(message, color = Sz.Silver) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(confirmLabel, color = if (destructive) Sz.Danger else Sz.BlueSoft, fontWeight = FontWeight.SemiBold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Anuluj", color = Sz.Silver) } },
    )
}

/** Wskaźnik jakości połączenia (4 słupki), jak w panelu WWW. */
@Composable
fun SignalBars(quality: Int?, modifier: Modifier = Modifier) {
    val level = when {
        quality == null || quality <= 0 -> 0
        quality < 40 -> 1
        quality < 60 -> 2
        quality < 80 -> 3
        else -> 4
    }
    val color = when {
        level <= 1 -> Sz.Danger
        level == 2 -> Sz.Warning
        else -> Sz.Success
    }
    val label = if (quality == null) "Jakość połączenia: brak sygnału" else "Jakość połączenia: $quality%"
    Row(modifier.height(14.dp).semantics { contentDescription = label }, verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        (1..4).forEach { bar ->
            Box(Modifier.width(3.dp).height((bar * 3.5f).dp).clip(RoundedCornerShape(1.dp)).background(if (bar <= level) color else Sz.Silver.copy(alpha = 0.25f)))
        }
    }
}

@Composable
fun MetricTile(
    icon: ImageVector,
    label: String,
    value: String?,
    detail: String,
    tone: Tone,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
) {
    SzCard(modifier, onClick) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(icon, contentDescription = null, tint = Sz.BlueSoft, modifier = Modifier.size(16.dp))
                CapsText(label, Modifier.weight(1f))
                StatusDot(tone)
            }
            Text(value ?: "—", color = Sz.Ink, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(detail, color = if (tone == Tone.Success || tone == Tone.Neutral) Sz.Muted else tone.color, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun InfoRow(label: String, value: String, valueColor: Color = Sz.Ink) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(label, color = Sz.Muted, fontSize = 14.sp)
        Spacer(Modifier.weight(1f))
        Text(value, color = valueColor, fontSize = 14.sp, textAlign = TextAlign.End, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun Divider() = Box(Modifier.fillMaxWidth().height(1.dp).background(Sz.Line))
