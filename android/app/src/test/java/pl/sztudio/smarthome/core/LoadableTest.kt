package pl.sztudio.smarthome.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoadableTest {
    @Test
    fun `dane po nieudanym odswiezeniu lub z pamieci podrecznej sa nieaktualne`() {
        val fresh = Loadable.success(listOf(1))
        assertFalse(fresh.isStale)
        assertTrue(fresh.failed(AppError.Unreachable).isStale)
        assertTrue(Loadable(listOf(1), fromCache = true).isStale)
        // Brak danych to nie „nieaktualne dane”, tylko błąd lub ładowanie.
        assertFalse(Loadable<Int>().failed(AppError.Unreachable).isStale)
        assertTrue(Loadable<Int>().isInitialLoading)
    }
}
