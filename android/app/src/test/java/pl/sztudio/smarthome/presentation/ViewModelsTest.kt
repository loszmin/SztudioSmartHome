package pl.sztudio.smarthome.presentation

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.core.Loadable
import pl.sztudio.smarthome.domain.model.ArmingMode
import pl.sztudio.smarthome.domain.model.EventCategory
import pl.sztudio.smarthome.domain.model.Role
import pl.sztudio.smarthome.domain.repository.SessionState
import pl.sztudio.smarthome.domain.usecase.AcknowledgeAlarmUseCase
import pl.sztudio.smarthome.domain.usecase.LoginUseCase
import pl.sztudio.smarthome.domain.usecase.SetArmingModeUseCase
import pl.sztudio.smarthome.domain.usecase.TestServerUseCase
import pl.sztudio.smarthome.presentation.alarms.AlarmsViewModel
import pl.sztudio.smarthome.presentation.alarms.PendingAction
import pl.sztudio.smarthome.presentation.cameras.CamerasViewModel
import pl.sztudio.smarthome.presentation.history.HistoryFilters
import pl.sztudio.smarthome.presentation.history.HistoryTab
import pl.sztudio.smarthome.presentation.history.HistoryViewModel
import pl.sztudio.smarthome.presentation.login.LoginViewModel
import pl.sztudio.smarthome.testutil.FakeAuth
import pl.sztudio.smarthome.testutil.FakeMonitoring
import pl.sztudio.smarthome.testutil.FakeSettings
import pl.sztudio.smarthome.testutil.MainDispatcherRule
import pl.sztudio.smarthome.testutil.alarm
import pl.sztudio.smarthome.testutil.camera
import pl.sztudio.smarthome.testutil.session
import java.time.LocalDate
import java.time.ZoneId

@OptIn(ExperimentalCoroutinesApi::class)
class ViewModelsTest {
    @get:Rule val main = MainDispatcherRule()

    @Test
    fun `logowanie - podpowiedz adresu, sukces czysci haslo, bledy sa pokazywane`() = runTest(main.dispatcher) {
        val auth = FakeAuth(SessionState.LoggedOut())
        val vm = LoginViewModel(LoginUseCase(auth), TestServerUseCase(auth), auth)
        assertEquals("https://192.168.1.10", vm.state.value.server)
        assertFalse(vm.state.value.canSubmit)

        vm.onUsernameChange("admin")
        vm.onPasswordChange("zle")
        auth.loginResult = Result.failure(AppError.InvalidCredentials())
        vm.submit()
        assertTrue(vm.state.value.error is AppError.InvalidCredentials)

        vm.onServerChange("http://192.168.1.10")
        vm.onPasswordChange("haslo")
        vm.submit()
        assertEquals(AppError.CleartextNotAllowed, vm.state.value.error)

        vm.onServerChange("192.168.1.10")
        auth.loginResult = Result.success(session())
        vm.submit()
        assertNull(vm.state.value.error)
        assertEquals("", vm.state.value.password)
        assertTrue(auth.state.value is SessionState.Active)
    }

    @Test
    fun `logowanie - odliczanie blokady`() = runTest(main.dispatcher) {
        val auth = FakeAuth(SessionState.LoggedOut()).apply { lockSeconds = 3 }
        val vm = LoginViewModel(LoginUseCase(auth), TestServerUseCase(auth), auth)
        assertEquals(3, vm.state.value.lockSeconds)
        assertFalse(vm.state.value.copy(username = "a", password = "b").canSubmit)
        auth.lockSeconds = 0
        advanceTimeBy(1_100)
        assertEquals(0, vm.state.value.lockSeconds)
    }

    private fun alarmsVm(role: Role, repository: FakeMonitoring): AlarmsViewModel {
        val auth = FakeAuth(SessionState.Active(session(role)))
        return AlarmsViewModel(repository, AcknowledgeAlarmUseCase(repository) { session(role) }, SetArmingModeUseCase(repository) { session(role) }, auth)
    }

    @Test
    fun `alarmy - operacja wykonuje sie dopiero po potwierdzeniu`() = runTest(main.dispatcher) {
        val repository = FakeMonitoring().apply { alarms.value = Loadable.success(listOf(alarm("a1"), alarm("a2"))) }
        val vm = alarmsVm(Role.ADMIN, repository)
        vm.state.launchIn(backgroundScope)

        vm.request(PendingAction.Acknowledge(alarm("a1")))
        assertTrue(repository.acknowledged.isEmpty())
        vm.dismiss()
        assertTrue(repository.acknowledged.isEmpty())

        vm.request(PendingAction.Acknowledge(alarm("a1")))
        vm.confirm()
        assertEquals(listOf("a1"), repository.acknowledged)
        assertEquals(listOf("a2"), vm.state.value.active.map { it.id })
        assertTrue(vm.state.value.message!!.contains("potwierdzony"))

        vm.request(PendingAction.Arm(ArmingMode.DISARMED))
        vm.confirm()
        assertEquals(listOf(ArmingMode.DISARMED), repository.armingChanges)
        assertEquals("System został rozbrojony.", vm.state.value.message)
    }

    @Test
    fun `alarmy - blad API i konto tylko do odczytu`() = runTest(main.dispatcher) {
        val repository = FakeMonitoring().apply { alarms.value = Loadable.success(listOf(alarm("a1"))); failNextAction = AppError.Forbidden("Brak uprawnień.") }
        val admin = alarmsVm(Role.ADMIN, repository)
        admin.state.launchIn(backgroundScope)
        admin.request(PendingAction.Acknowledge(alarm("a1")))
        admin.confirm()
        assertEquals("Brak uprawnień.", admin.state.value.message)

        val viewer = alarmsVm(Role.VIEWER, repository)
        viewer.state.launchIn(backgroundScope)
        assertFalse(viewer.state.value.canControl)
    }

    @Test
    fun `kamery - uklady 1, 4, 6 i strony pokazuja tylko widoczne kamery`() = runTest(main.dispatcher) {
        val repository = FakeMonitoring().apply { cameras.value = Loadable.success((1..8).map { camera("c$it") }) }
        val saved = SavedStateHandle()
        val vm = CamerasViewModel(repository, FakeSettings(), saved)
        vm.state.launchIn(backgroundScope)

        assertEquals(4, vm.state.value.layout)
        assertEquals(listOf("c1", "c2", "c3", "c4"), vm.state.value.visible.map { it.id })
        assertEquals(2, vm.state.value.pageCount)

        vm.select("c7")
        assertEquals(1, vm.state.value.currentPage)
        vm.setLayout(1)
        assertEquals(listOf("c7"), vm.state.value.visible.map { it.id })
        vm.setLayout(6)
        assertEquals(listOf("c7", "c8"), vm.state.value.visible.map { it.id })
        vm.setLayout(9) // nieobsługiwany układ
        assertEquals(6, vm.state.value.layout)

        // Stan przetrwa odtworzenie ViewModelu (np. po zabiciu procesu).
        val restored = CamerasViewModel(repository, FakeSettings(), saved)
        restored.state.launchIn(backgroundScope)
        assertEquals(6, restored.state.value.layout)
        assertEquals("c7", restored.state.value.selected?.id)
    }

    @Test
    fun `historia - filtry daty w czasie lokalnym i zakladka awarii`() = runTest(main.dispatcher) {
        val repository = FakeMonitoring()
        val vm = HistoryViewModel(repository)
        vm.state.launchIn(backgroundScope)
        val day = LocalDate.of(2026, 11, 15)
        vm.setFilters(HistoryFilters(EventCategory.DOOR, day, day))

        val query = repository.eventQueries.last()
        assertEquals(EventCategory.DOOR, query.category)
        assertEquals(day.atStartOfDay(ZoneId.systemDefault()).toInstant(), query.from)
        assertEquals(day.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().minusMillis(1), query.to)

        vm.setFilters(HistoryFilters(from = day, to = day.minusDays(1)))
        assertTrue(vm.state.value.filters.invalidRange)
        assertNull(repository.eventQueries.last().from)

        vm.setTab(HistoryTab.FAILURES)
        vm.load()
        assertEquals(EventCategory.CAMERA_OFFLINE, repository.eventQueries.last().category)
    }
}
