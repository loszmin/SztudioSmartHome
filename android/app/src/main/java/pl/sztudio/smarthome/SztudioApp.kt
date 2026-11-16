package pl.sztudio.smarthome

import android.app.Application
import pl.sztudio.smarthome.di.AppContainer
import pl.sztudio.smarthome.di.AppDependencies

class SztudioApp : Application() {
    lateinit var container: AppDependencies
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this).also { it.start() }
    }
}
