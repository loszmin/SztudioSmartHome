package pl.sztudio.smarthome.domain

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.domain.model.AlarmStatus
import pl.sztudio.smarthome.domain.model.ArmingMode
import pl.sztudio.smarthome.domain.model.ConnectionStatus
import pl.sztudio.smarthome.domain.model.Role
import pl.sztudio.smarthome.domain.model.Severity
import pl.sztudio.smarthome.domain.usecase.AcknowledgeAlarmUseCase
import pl.sztudio.smarthome.domain.usecase.LoginUseCase
import pl.sztudio.smarthome.domain.usecase.ObserveDashboardUseCase
import pl.sztudio.smarthome.domain.usecase.SetArmingModeUseCase
import pl.sztudio.smarthome.testutil.FakeAuth
import pl.sztudio.smarthome.testutil.FakeMonitoring
import pl.sztudio.smarthome.testutil.alarm
import pl.sztudio.smarthome.testutil.camera
import pl.sztudio.smarthome.testutil.session

class UseCasesTest {
    @Test
    fun `logowanie odrzuca http i puste pola zanim cokolwiek zostanie wyslane`() = runBlocking {
        val auth = FakeAuth()
        val login = LoginUseCase(auth)
        assertEquals(AppError.CleartextNotAllowed, login("http://192.168.1.10", "admin", "x").exceptionOrNull())
        assertTrue(login("192.168.1.10", " ", "x").exceptionOrNull() is AppError.InvalidCredentials)
        assertTrue(login("192.168.1.10", "admin", "").exceptionOrNull() is AppError.InvalidCredentials)
        assertTrue(auth.logins.isEmpty())
        assertTrue(login("192.168.1.10", "admin", "haslo").isSuccess)
        assertEquals("https://192.168.1.10", auth.logins.single().first)
    }

    @Test
    fun `operacje zmieniajace stan wymagaja roli admin`() = runBlocking {
        val repository = FakeMonitoring().apply { alarms.value = Loadable.success(listOf(alarm("a1"))) }
        var current = session(Role.VIEWER)
        val acknowledge = AcknowledgeAlarmUseCase(repository) { current }
        val arming = SetArmingModeUseCase(repository) { current }

        assertTrue(acknowledge(alarm("a1")).exceptionOrNull() is AppError.Forbidden)
        assertTrue(arming(ArmingMode.DISARMED).exceptionOrNull() is AppError.Forbidden)
        assertTrue(repository.acknowledged.isEmpty() && repository.armingChanges.isEmpty())

        current = session(Role.ADMIN)
        assertEquals(AlarmStatus.ACKNOWLEDGED, acknowledge(alarm("a1")).getOrThrow().status)
        // Alarm już potwierdzony – bez ponownego wywołania API.
        acknowledge(alarm("a1", status = AlarmStatus.ACKNOWLEDGED))
        assertEquals(listOf("a1"), repository.acknowledged)
    }

    @Test
    fun `podsumowanie dashboardu`() = runBlocking {
        val repository = FakeMonitoring().apply {
            cameras.value = Loadable.success(listOf(camera("c1"), camera("c2", ConnectionStatus.OFFLINE), camera("c3")))
            alarms.value = Loadable.success(listOf(alarm("a1", severity = Severity.WARNING), alarm("a2", status = AlarmStatus.RESOLVED)))
        }
        val summary = ObserveDashboardUseCase(repository)().first()
        assertEquals(2, summary.camerasOnline)
        assertEquals(1, summary.camerasOffline)
        assertEquals(listOf("a1"), summary.activeAlarms.map { it.id })
        assertTrue(!summary.hasCriticalAlarm)
        assertEquals(null, summary.sensorCount) // brak danych ≠ zero czujników
        assertTrue(!summary.isStale)

        repository.cameras.value = repository.cameras.value.copy(error = AppError.Unreachable)
        assertTrue(ObserveDashboardUseCase(repository)().first().isStale)
    }
}
