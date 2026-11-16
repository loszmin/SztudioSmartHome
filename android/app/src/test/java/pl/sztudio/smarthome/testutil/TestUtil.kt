package pl.sztudio.smarthome.testutil

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.rules.TemporaryFolder
import org.junit.rules.TestWatcher
import org.junit.runner.Description
import pl.sztudio.smarthome.data.api.HttpClientFactory
import pl.sztudio.smarthome.data.api.TokenProvider
import pl.sztudio.smarthome.data.auth.AesGcmBox
import java.io.File
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/** Szyfrowanie AES-GCM z kluczem w pamięci – ta sama logika co [pl.sztudio.smarthome.data.auth.KeystoreCryptoBox], bez Android Keystore. */
class FakeCryptoBox : AesGcmBox() {
    private val key: SecretKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    override fun key() = key
}

@OptIn(ExperimentalCoroutinesApi::class)
class MainDispatcherRule(val dispatcher: TestDispatcher = UnconfinedTestDispatcher()) : TestWatcher() {
    override fun starting(description: Description) = Dispatchers.setMain(dispatcher)
    override fun finished(description: Description) = Dispatchers.resetMain()
}

fun preferencesStore(folder: TemporaryFolder, name: String = "test") =
    PreferenceDataStoreFactory.create(scope = CoroutineScope(SupervisorJob() + Dispatchers.IO), produceFile = { File(folder.newFolder(), "$name.preferences_pb") })

class TokenHolder(var token: String? = null) : TokenProvider {
    var unauthorizedCalls = 0
    override fun currentToken() = token
    override fun onUnauthorized() {
        unauthorizedCalls += 1
    }
}

/**
 * Serwer HTTPS na potrzeby testów: własny „lokalny CA” i certyfikat dla `localhost` – odwzorowanie instalacji
 * Sztudio. Klient ufa temu CA tak, jak telefon z zainstalowanym certyfikatem użytkownika.
 */
class TlsFixture {
    val ca: HeldCertificate = HeldCertificate.Builder().certificateAuthority(0).commonName("Sztudio test CA").build()
    private val serverCert = HeldCertificate.Builder().addSubjectAlternativeName("localhost").signedBy(ca).build()
    private val otherHostCert = HeldCertificate.Builder().addSubjectAlternativeName("inny-serwer.lan").signedBy(ca).build()

    fun server(certificateForOtherHost: Boolean = false) = MockWebServer().apply {
        val held = if (certificateForOtherHost) otherHostCert else serverCert
        useHttps(HandshakeCertificates.Builder().heldCertificate(held, ca.certificate).build().sslSocketFactory(), false)
    }

    /** Klient aplikacji (te same interceptory) ufający lokalnemu CA – odpowiednik network_security_config. */
    fun client(tokens: TokenProvider, trustLocalCa: Boolean = true, record: (pl.sztudio.smarthome.domain.model.ApiTiming) -> Unit = {}): OkHttpClient {
        // Bez lokalnego CA klient ufa tylko certyfikatom systemowym – jak telefon bez zainstalowanego certyfikatu Sztudio.
        val trust = HandshakeCertificates.Builder().addPlatformTrustedCertificates().apply { if (trustLocalCa) addTrustedCertificate(ca.certificate) }.build()
        return HttpClientFactory.create(tokens, record).newBuilder().sslSocketFactory(trust.sslSocketFactory(), trust.trustManager).build()
    }
}

fun MockWebServer.baseUrl(): String = url("/").toString().trimEnd('/')
