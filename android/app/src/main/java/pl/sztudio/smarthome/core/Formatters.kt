package pl.sztudio.smarthome.core

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val polish = Locale.forLanguageTag("pl-PL")
private val timeFormat = DateTimeFormatter.ofPattern("HH:mm:ss", polish)
private val shortTimeFormat = DateTimeFormatter.ofPattern("HH:mm", polish)
private val dateTimeFormat = DateTimeFormatter.ofPattern("dd.MM.yyyy, HH:mm", polish)
private val dateFormat = DateTimeFormatter.ofPattern("EEEE, d MMMM", polish)

object Formatters {
    var zone: ZoneId = ZoneId.systemDefault()

    fun time(instant: Instant): String = timeFormat.format(instant.atZone(zone))
    fun shortTime(instant: Instant): String = shortTimeFormat.format(instant.atZone(zone))
    fun dateTime(instant: Instant): String = dateTimeFormat.format(instant.atZone(zone))
    fun day(instant: Instant): String = dateFormat.format(instant.atZone(zone)).replaceFirstChar { it.titlecase(polish) }

    /** Czas względny, np. „5 min temu”; `null` = „nigdy”. */
    fun relative(instant: Instant?, now: Instant = Instant.now()): String {
        if (instant == null) return "nigdy"
        val seconds = Duration.between(instant, now).seconds
        return when {
            seconds < 45 -> "przed chwilą"
            seconds < 3600 -> "${seconds / 60} min temu"
            seconds < 86_400 -> "${seconds / 3600} godz. temu"
            seconds < 2 * 86_400 -> "wczoraj"
            else -> "${seconds / 86_400} dni temu"
        }
    }

    fun uptime(totalSeconds: Long): String {
        val days = totalSeconds / 86_400
        val hours = totalSeconds % 86_400 / 3600
        val minutes = totalSeconds % 3600 / 60
        return when {
            days > 0 -> "$days d $hours godz."
            hours > 0 -> "$hours godz. $minutes min"
            else -> "$minutes min"
        }
    }
}
