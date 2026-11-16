package pl.sztudio.smarthome.presentation.sensors

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Battery2Bar
import androidx.compose.material.icons.outlined.BatteryFull
import androidx.compose.material.icons.automirrored.outlined.DirectionsRun
import androidx.compose.material.icons.outlined.DoorFront
import androidx.compose.material.icons.outlined.Sensors
import androidx.compose.material.icons.outlined.Thermostat
import androidx.compose.material.icons.outlined.Vibration
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material.icons.outlined.Whatshot
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.core.Formatters
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.model.Sensor
import pl.sztudio.smarthome.domain.model.SensorType
import pl.sztudio.smarthome.presentation.appViewModel
import pl.sztudio.smarthome.presentation.components.Badge
import pl.sztudio.smarthome.presentation.components.EmptyBlock
import pl.sztudio.smarthome.presentation.components.ErrorBlock
import pl.sztudio.smarthome.presentation.components.LoadingBlock
import pl.sztudio.smarthome.presentation.components.ScreenScaffold
import pl.sztudio.smarthome.presentation.components.StaleBanner
import pl.sztudio.smarthome.presentation.components.SzCard
import pl.sztudio.smarthome.presentation.theme.Sz
import pl.sztudio.smarthome.presentation.theme.Tone
import java.util.Locale

@Composable
fun SensorsScreen() {
    val viewModel = appViewModel { SensorsViewModel(it.monitoring) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    SensorsContent(state, viewModel::setFilter, viewModel::refresh)
}

private data class TypeInfo(val label: String, val icon: ImageVector, val idle: String, val triggered: String, val triggeredTone: Tone)

private val TYPES = mapOf(
    SensorType.MOTION to TypeInfo("Ruch", Icons.AutoMirrored.Outlined.DirectionsRun, "Brak ruchu", "Wykryto ruch", Tone.Primary),
    SensorType.CONTACT to TypeInfo("Drzwi i okna", Icons.Outlined.DoorFront, "Zamknięte", "Otwarte", Tone.Warning),
    SensorType.FLOOD to TypeInfo("Zalanie", Icons.Outlined.WaterDrop, "Sucho", "Wykryto zalanie", Tone.Danger),
    SensorType.SMOKE to TypeInfo("Dym", Icons.Outlined.Whatshot, "Brak dymu", "Wykryto dym", Tone.Danger),
    SensorType.TEMPERATURE to TypeInfo("Temperatura", Icons.Outlined.Thermostat, "W normie", "Poza zakresem", Tone.Warning),
    SensorType.VIBRATION to TypeInfo("Wibracje", Icons.Outlined.Vibration, "Brak wibracji", "Wykryto wibracje", Tone.Warning),
    SensorType.UNKNOWN to TypeInfo("Inne", Icons.Outlined.Sensors, "Spoczynek", "Aktywny", Tone.Warning),
)

@Composable
fun SensorsContent(state: SensorsUiState, onFilter: (SensorType?) -> Unit, onRefresh: () -> Unit) {
    ScreenScaffold("Czujniki", actions = { IconButton(onClick = onRefresh) { Icon(Icons.Outlined.Refresh, contentDescription = "Odśwież") } }) {
        val sensors = state.sensors
        when {
            sensors.data == null && sensors.error != null -> ErrorBlock(sensors.error, onRefresh)
            sensors.data == null -> LoadingBlock()
            sensors.data.isEmpty() -> EmptyBlock("Brak czujników", "Sztudio Core nie zwrócił żadnego czujnika.", Icons.Outlined.Sensors)
            else -> LazyColumn(Modifier.fillMaxSize().testTag("sensors"), contentPadding = PaddingValues(Sz.gutter), verticalArrangement = Arrangement.spacedBy(Sz.gap)) {
                if (sensors.isStale) item { StaleBanner(sensors.updatedAt, sensors.error) }
                item {
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(state.filter == null, { onFilter(null) }, label = { Text("Wszystkie (${sensors.data.size})") })
                        state.availableTypes.forEach { type ->
                            FilterChip(
                                state.filter == type, { onFilter(type) },
                                label = { Text("${TYPES.getValue(type).label} (${sensors.data.count { it.type == type }})") },
                                modifier = Modifier.testTag("filter-${type.name.lowercase()}"),
                            )
                        }
                    }
                }
                state.groups.forEach { (type, list) ->
                    item(key = "header-$type") {
                        Text(TYPES.getValue(type).label, color = Sz.Ink, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
                    }
                    items(list, key = { it.id }) { SensorCard(it) }
                }
            }
        }
    }
}

@Composable
fun SensorCard(sensor: Sensor) {
    val info = TYPES.getValue(sensor.type)
    val offline = sensor.connection == ConnectionStatus.OFFLINE
    val tone = when {
        offline -> Tone.Neutral
        sensor.triggered -> info.triggeredTone
        else -> Tone.Success
    }
    val stateText = when {
        offline -> "Brak danych"
        sensor.value != null -> String.format(Locale.forLanguageTag("pl-PL"), "%.1f %s", sensor.value, sensor.unit.orEmpty()).trim()
        sensor.triggered -> info.triggered
        else -> info.idle
    }
    SzCard(Modifier.testTag("sensor-${sensor.id}").semantics(mergeDescendants = true) {}) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val shape = RoundedCornerShape(10.dp)
            Box(
                Modifier.size(40.dp).clip(shape).background(tone.color.copy(alpha = 0.1f)).border(1.dp, tone.color.copy(alpha = 0.3f), shape),
                contentAlignment = Alignment.Center,
            ) { Icon(info.icon, contentDescription = info.label, tint = tone.color, modifier = Modifier.size(20.dp)) }
            Column(Modifier.weight(1f)) {
                Text(sensor.name, color = Sz.Ink, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(sensor.location.ifBlank { "—" }, color = Sz.Muted, fontSize = 12.sp)
                Text(stateText, color = if (tone == Tone.Success) Sz.Ink else tone.color, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Badge(if (offline) "Offline" else "Online", if (offline) Tone.Danger else Tone.Success, dot = true)
                sensor.batteryPercent?.let { battery ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (battery <= 20) Icons.Outlined.Battery2Bar else Icons.Outlined.BatteryFull, contentDescription = "Bateria", tint = if (battery <= 20) Sz.Warning else Sz.Muted, modifier = Modifier.size(14.dp))
                        Text("$battery%", color = if (battery <= 20) Sz.Warning else Sz.Muted, fontSize = 12.sp)
                    }
                }
                Text(Formatters.relative(sensor.lastUpdatedAt), color = Sz.Muted, fontSize = 12.sp)
            }
        }
    }
}
