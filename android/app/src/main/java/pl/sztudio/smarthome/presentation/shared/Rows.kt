package pl.sztudio.smarthome.presentation.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DoorFront
import androidx.compose.material.icons.automirrored.outlined.DirectionsRun
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.RestartAlt
import androidx.compose.material.icons.outlined.NotificationImportant
import androidx.compose.material.icons.outlined.VideocamOff
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pl.sztudio.smarthome.core.Formatters
import pl.sztudio.smarthome.domain.model.Alarm
import pl.sztudio.smarthome.domain.model.AlarmSourceType
import pl.sztudio.smarthome.domain.model.ArmingMode
import pl.sztudio.smarthome.domain.model.EventCategory
import pl.sztudio.smarthome.domain.model.Severity
import pl.sztudio.smarthome.domain.model.SystemEvent
import pl.sztudio.smarthome.presentation.components.Badge
import pl.sztudio.smarthome.presentation.components.StatusDot
import pl.sztudio.smarthome.presentation.theme.Sz
import pl.sztudio.smarthome.presentation.theme.Tone

fun severityTone(severity: Severity) = when (severity) {
    Severity.CRITICAL -> Tone.Danger
    Severity.WARNING -> Tone.Warning
    Severity.INFO -> Tone.Primary
}

fun severityLabel(severity: Severity) = when (severity) {
    Severity.CRITICAL -> "Krytyczny"
    Severity.WARNING -> "Ostrzeżenie"
    Severity.INFO -> "Informacja"
}

fun armingLabel(mode: ArmingMode) = when (mode) {
    ArmingMode.DISARMED -> "Rozbrojony"
    ArmingMode.ARMED_HOME -> "Tryb domowy"
    ArmingMode.ARMED_AWAY -> "Pełna ochrona"
}

fun sourceLabel(type: AlarmSourceType) = when (type) {
    AlarmSourceType.SENSOR -> "Czujnik"
    AlarmSourceType.CAMERA -> "Kamera"
    AlarmSourceType.NETWORK -> "Sieć"
    AlarmSourceType.SYSTEM -> "System"
    AlarmSourceType.UNKNOWN -> "Źródło"
}

fun categoryLabel(category: EventCategory?) = when (category) {
    EventCategory.MOTION -> "Wykrycie ruchu"
    EventCategory.CAMERA_OFFLINE -> "Utrata połączenia z kamerą"
    EventCategory.DEVICE_ONLINE -> "Powrót urządzenia online"
    EventCategory.DOOR -> "Drzwi i okna"
    EventCategory.ALARM -> "Alarm"
    EventCategory.RESTART -> "Restart urządzenia"
    null -> "Inne"
}

fun categoryIcon(category: EventCategory?): ImageVector = when (category) {
    EventCategory.MOTION -> Icons.AutoMirrored.Outlined.DirectionsRun
    EventCategory.CAMERA_OFFLINE -> Icons.Outlined.VideocamOff
    EventCategory.DEVICE_ONLINE -> Icons.Outlined.Wifi
    EventCategory.DOOR -> Icons.Outlined.DoorFront
    EventCategory.ALARM -> Icons.Outlined.NotificationImportant
    EventCategory.RESTART -> Icons.Outlined.RestartAlt
    null -> Icons.Outlined.Info
}

@Composable
fun EventRow(event: SystemEvent, modifier: Modifier = Modifier, absoluteTime: Boolean = false) {
    val tone = severityTone(event.severity)
    Row(modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        val shape = RoundedCornerShape(8.dp)
        Box(
            Modifier.size(32.dp).clip(shape).background(tone.color.copy(alpha = 0.1f)).border(1.dp, tone.color.copy(alpha = 0.25f), shape),
            contentAlignment = Alignment.Center,
        ) { Icon(categoryIcon(event.category), contentDescription = categoryLabel(event.category), tint = tone.color, modifier = Modifier.size(16.dp)) }
        Column(Modifier.weight(1f)) {
            Text(event.title, color = Sz.Ink, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(event.source, color = Sz.Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (absoluteTime && event.description != null) Text(event.description, color = Sz.Silver, fontSize = 12.sp)
        }
        Text(if (absoluteTime) Formatters.time(event.occurredAt) else Formatters.relative(event.occurredAt), color = Sz.Muted, fontSize = 12.sp)
    }
}

@Composable
fun AlarmRow(alarm: Alarm, compact: Boolean = false, trailing: (@Composable () -> Unit)? = null) {
    val tone = severityTone(alarm.severity)
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        StatusDot(tone, Modifier.padding(top = 6.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(alarm.title, color = Sz.Ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f, fill = false))
                Badge(severityLabel(alarm.severity), tone)
            }
            if (!compact && alarm.description != null) Text(alarm.description, color = Sz.Silver, fontSize = 13.sp)
            Text(
                "${sourceLabel(alarm.sourceType)}: ${alarm.sourceName}" + (alarm.location?.let { " · $it" } ?: ""),
                color = Sz.Muted, fontSize = 12.sp,
            )
            Text(
                if (compact) Formatters.relative(alarm.triggeredAt) else "${Formatters.dateTime(alarm.triggeredAt)} (${Formatters.relative(alarm.triggeredAt)})",
                color = Sz.Muted, fontSize = 12.sp,
            )
            if (!compact && alarm.acknowledgedAt != null) {
                Text("Potwierdzony ${Formatters.dateTime(alarm.acknowledgedAt)}" + (alarm.acknowledgedBy?.let { " · $it" } ?: ""), color = Sz.Muted, fontSize = 12.sp)
            }
        }
        trailing?.invoke()
    }
}
