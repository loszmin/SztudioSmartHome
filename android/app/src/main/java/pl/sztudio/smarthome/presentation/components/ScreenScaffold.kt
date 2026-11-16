package pl.sztudio.smarthome.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.presentation.LocalAppDependencies
import pl.sztudio.smarthome.presentation.theme.Sz

/** Nagłówek ekranu z opcjonalnym powrotem i akcjami oraz paskiem stanu połączenia pod spodem. */
@Composable
fun ScreenScaffold(
    title: String,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
    showConnection: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().background(Sz.Midnight).statusBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(start = if (onBack != null) 4.dp else Sz.gutter, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Wstecz", tint = Sz.Ink) }
            }
            Text(title, style = MaterialTheme.typography.titleLarge, color = Sz.Ink, modifier = Modifier.weight(1f).semantics { heading() })
            actions()
        }
        if (showConnection) ConnectionBanner()
        content()
    }
}

/** Brak sieci w telefonie lub brak odpowiedzi Core – widoczne na każdym ekranie. */
@Composable
fun ConnectionBanner() {
    val dependencies = LocalAppDependencies.current
    val online by dependencies.network.isOnline.collectAsStateWithLifecycle()
    val status by dependencies.monitoring.status.collectAsStateWithLifecycle()
    val coreDown = status.error.let {
        it is AppError.Unreachable || it is AppError.Timeout || it is AppError.ServerNotFound || it is AppError.NoNetwork ||
            it is AppError.UntrustedCertificate || it is AppError.CertificateHostMismatch
    }
    val (icon, title, text) = when {
        !online -> Triple(Icons.Outlined.WifiOff, "Brak sieci", "Telefon nie ma połączenia z siecią. Połączenie zostanie wznowione automatycznie.")
        coreDown -> Triple(Icons.Outlined.CloudOff, "Brak połączenia z Sztudio Core", status.error?.userMessage.orEmpty())
        else -> return
    }
    val shape = RoundedCornerShape(10.dp)
    Row(
        Modifier
            .padding(horizontal = Sz.gutter, vertical = 4.dp)
            .fillMaxWidth()
            .clip(shape)
            .background(Sz.Danger.copy(alpha = 0.1f))
            .border(1.dp, Sz.Danger.copy(alpha = 0.3f), shape)
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(icon, contentDescription = null, tint = Sz.Danger, modifier = Modifier.size(18.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Sz.Ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            if (text.isNotEmpty()) Text(text, color = Sz.Silver, fontSize = 12.sp)
        }
    }
    Spacer(Modifier.size(4.dp))
}
