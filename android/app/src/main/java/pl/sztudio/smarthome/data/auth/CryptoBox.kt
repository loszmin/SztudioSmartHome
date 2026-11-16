package pl.sztudio.smarthome.data.auth

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Szyfrowanie danych przechowywanych na urządzeniu (token sesji, ostatni znany stan). */
interface CryptoBox {
    fun encrypt(plain: ByteArray): String
    fun decrypt(encoded: String): ByteArray
}

/** AES-256-GCM z kluczem w Android Keystore – klucz nie opuszcza sprzętowego magazynu i nie trafia do kopii zapasowych. */
abstract class AesGcmBox : CryptoBox {
    protected abstract fun key(): SecretKey

    override fun encrypt(plain: ByteArray): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.doFinal(plain)
        return Base64.getEncoder().encodeToString(cipher.iv + encrypted)
    }

    override fun decrypt(encoded: String): ByteArray {
        val bytes = Base64.getDecoder().decode(encoded)
        require(bytes.size > IV_BYTES) { "Uszkodzone dane" }
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
        }
        return cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES)
    }

    companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}

class KeystoreCryptoBox(private val alias: String = "sztudio.session.v1") : AesGcmBox() {
    override fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply {
            init(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
        }.generateKey()
    }

    /** Usuwa klucz – zaszyfrowane dane stają się nieczytelne (wylogowanie). */
    fun destroy() {
        runCatching { KeyStore.getInstance(KEYSTORE).apply { load(null) }.deleteEntry(alias) }
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
    }
}
