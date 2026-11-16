package pl.sztudio.smarthome.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import pl.sztudio.smarthome.di.AppDependencies

val LocalAppDependencies = staticCompositionLocalOf<AppDependencies> { error("Brak zależności aplikacji") }

/** ViewModel tworzony z zależnościami aplikacji; przetrwa obrót ekranu i powrót z innego ekranu. */
@Composable
inline fun <reified VM : ViewModel> appViewModel(key: String? = null, crossinline create: CreationExtras.(AppDependencies) -> VM): VM {
    val dependencies = LocalAppDependencies.current
    return viewModel(key = key, factory = viewModelFactory { initializer { create(dependencies) } })
}
