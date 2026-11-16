package pl.sztudio.smarthome.presentation.history

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.FilterAltOff
import androidx.compose.material.icons.outlined.History
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.core.Formatters
import pl.sztudio.smarthome.domain.model.EventCategory
import pl.sztudio.smarthome.domain.model.SystemEvent
import pl.sztudio.smarthome.presentation.appViewModel
import pl.sztudio.smarthome.presentation.components.Divider
import pl.sztudio.smarthome.presentation.components.EmptyBlock
import pl.sztudio.smarthome.presentation.components.ErrorBlock
import pl.sztudio.smarthome.presentation.components.LoadingBlock
import pl.sztudio.smarthome.presentation.components.ScreenScaffold
import pl.sztudio.smarthome.presentation.components.SzCard
import pl.sztudio.smarthome.presentation.shared.AlarmRow
import pl.sztudio.smarthome.presentation.shared.EventRow
import pl.sztudio.smarthome.presentation.shared.categoryLabel
import pl.sztudio.smarthome.presentation.theme.Sz
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@Composable
fun HistoryScreen(onBack: () -> Unit) {
    val viewModel = appViewModel { HistoryViewModel(it.monitoring) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    HistoryContent(state, onBack, viewModel::setTab, viewModel::setFilters, viewModel::clearFilters, { viewModel.load() })
}

private val dayFormat = DateTimeFormatter.ofPattern("dd.MM.yyyy")

@Composable
fun HistoryContent(
    state: HistoryUiState,
    onBack: () -> Unit,
    onTab: (HistoryTab) -> Unit,
    onFilters: (HistoryFilters) -> Unit,
    onClear: () -> Unit,
    onRetry: () -> Unit,
) {
    var picking by remember { mutableStateOf<String?>(null) }
    ScreenScaffold("Historia zdarzeń", onBack = onBack) {
        LazyColumn(Modifier.fillMaxSize().testTag("history"), contentPadding = PaddingValues(Sz.gutter), verticalArrangement = Arrangement.spacedBy(Sz.gap)) {
            item {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    HistoryTab.entries.forEachIndexed { index, tab ->
                        SegmentedButton(
                            state.tab == tab, { onTab(tab) }, SegmentedButtonDefaults.itemShape(index, HistoryTab.entries.size),
                            label = { Text(when (tab) { HistoryTab.EVENTS -> "Zdarzenia"; HistoryTab.ALARMS -> "Alarmy"; HistoryTab.FAILURES -> "Awarie" }) },
                        )
                    }
                }
            }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (state.tab == HistoryTab.EVENTS) CategoryFilter(state.filters.category) { onFilters(state.filters.copy(category = it)) }
                    AssistChip(onClick = { picking = "from" }, label = { Text("Od: " + (state.filters.from?.format(dayFormat) ?: "—")) }, leadingIcon = { Icon(Icons.Outlined.DateRange, null) }, modifier = Modifier.testTag("filter-from"))
                    AssistChip(onClick = { picking = "to" }, label = { Text("Do: " + (state.filters.to?.format(dayFormat) ?: "—")) }, leadingIcon = { Icon(Icons.Outlined.DateRange, null) })
                    if (state.filters.active) AssistChip(onClick = onClear, label = { Text("Wyczyść") }, leadingIcon = { Icon(Icons.Outlined.FilterAltOff, null) }, modifier = Modifier.testTag("filter-clear"))
                }
                if (state.filters.invalidRange) Text("Data początkowa jest późniejsza niż końcowa – zakres dat pominięto.", color = Sz.Danger, fontSize = 12.sp)
            }

            when (state.tab) {
                HistoryTab.ALARMS -> alarmList(state)
                HistoryTab.FAILURES -> {
                    alarmList(state)
                    eventList(state, state.failureEvents, "Utrata połączenia z kamerą", onRetry)
                }
                HistoryTab.EVENTS -> eventList(state, state.events.data.orEmpty(), null, onRetry)
            }
        }
    }

    picking?.let { which ->
        DateDialog(
            initial = if (which == "from") state.filters.from else state.filters.to,
            onDismiss = { picking = null },
            onPicked = { date ->
                picking = null
                onFilters(if (which == "from") state.filters.copy(from = date) else state.filters.copy(to = date))
            },
        )
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.alarmList(state: HistoryUiState) {
    item {
        SzCard {
            val alarms = state.visibleAlarms
            if (alarms.isEmpty()) {
                EmptyBlock(if (state.tab == HistoryTab.FAILURES) "Brak awarii w wybranym okresie" else "Brak alarmów w wybranym okresie")
            } else {
                alarms.forEachIndexed { index, alarm ->
                    if (index > 0) Divider()
                    AlarmRow(alarm)
                }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.eventList(state: HistoryUiState, list: List<SystemEvent>, title: String?, onRetry: () -> Unit) {
    val events = state.events
    when {
        events.data == null && events.error != null -> item { SzCard { ErrorBlock(events.error, onRetry) } }
        events.data == null || (events.loading && events.data.isEmpty()) -> item { LoadingBlock() }
        list.isEmpty() -> if (title == null) item {
            SzCard { EmptyBlock(if (state.filters.active) "Brak zdarzeń dla wybranych filtrów" else "Brak zdarzeń", icon = Icons.Outlined.History) }
        }
        else -> {
            if (title != null) item { Text(title, color = Sz.Ink, fontWeight = FontWeight.SemiBold) }
            list.groupBy { it.occurredAt.atZone(Formatters.zone).toLocalDate() }.forEach { (day, dayEvents) ->
                item(key = "day-$day") { Text(Formatters.day(dayEvents.first().occurredAt) + " · ${dayEvents.size}", color = Sz.Muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp)) }
                items(dayEvents, key = { it.id }) { event -> SzCard { EventRow(event, Modifier.padding(12.dp), absoluteTime = true) } }
            }
        }
    }
}

@Composable
private fun CategoryFilter(selected: EventCategory?, onSelect: (EventCategory?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    AssistChip(onClick = { open = true }, label = { Text(selected?.let(::categoryLabel) ?: "Wszystkie kategorie") }, modifier = Modifier.testTag("filter-category"))
    DropdownMenu(open, onDismissRequest = { open = false }) {
        DropdownMenuItem(text = { Text("Wszystkie kategorie") }, onClick = { open = false; onSelect(null) })
        EventCategory.entries.forEach { category ->
            DropdownMenuItem(text = { Text(categoryLabel(category)) }, onClick = { open = false; onSelect(category) })
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateDialog(initial: LocalDate?, onDismiss: () -> Unit, onPicked: (LocalDate?) -> Unit) {
    val picker = rememberDatePickerState(
        initialSelectedDateMillis = initial?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli(),
        selectableDates = object : androidx.compose.material3.SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis <= System.currentTimeMillis()
        },
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = { onPicked(picker.selectedDateMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }) }) { Text("Wybierz") }
        },
        dismissButton = {
            Row {
                TextButton(onClick = { onPicked(null) }) { Text("Bez daty") }
                TextButton(onClick = onDismiss) { Text("Anuluj") }
            }
        },
    ) { DatePicker(picker) }
}
