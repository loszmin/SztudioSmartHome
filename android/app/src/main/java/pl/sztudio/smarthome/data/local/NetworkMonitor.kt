package pl.sztudio.smarthome.data.local

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Czy urządzenie ma aktywną sieć (nie oznacza dostępności Core – tę sprawdzają żądania). */
interface NetworkMonitor {
    val isOnline: StateFlow<Boolean>
}

class AndroidNetworkMonitor(context: Context) : NetworkMonitor {
    private val manager = context.getSystemService(ConnectivityManager::class.java)
    private val active = mutableSetOf<Network>()
    private val _isOnline = MutableStateFlow(manager.activeNetwork != null)
    override val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()

    init {
        val request = NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build()
        manager.registerNetworkCallback(
            request,
            object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = update { active += network }
                override fun onLost(network: Network) = update { active -= network }
            },
        )
    }

    private fun update(change: () -> Unit) = synchronized(active) {
        change()
        _isOnline.value = active.isNotEmpty()
    }
}
