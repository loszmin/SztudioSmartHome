package pl.sztudio.smarthome.presentation.login

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pl.sztudio.smarthome.core.AppError
import pl.sztudio.smarthome.presentation.appViewModel
import pl.sztudio.smarthome.presentation.components.SzCard
import pl.sztudio.smarthome.presentation.components.SztudioLogo
import pl.sztudio.smarthome.presentation.theme.Sz

@Composable
fun LoginScreen(reason: AppError?, onShowCaHelp: () -> Unit) {
    val viewModel = appViewModel { LoginViewModel(it.login, it.testServer, it.auth) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    LoginContent(
        state = state,
        reason = reason,
        onServerChange = viewModel::onServerChange,
        onUsernameChange = viewModel::onUsernameChange,
        onPasswordChange = viewModel::onPasswordChange,
        onTestServer = viewModel::testServer,
        onSubmit = viewModel::submit,
        onShowCaHelp = onShowCaHelp,
    )
}

@Composable
fun LoginContent(
    state: LoginUiState,
    reason: AppError?,
    onServerChange: (String) -> Unit,
    onUsernameChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onTestServer: () -> Unit,
    onSubmit: () -> Unit,
    onShowCaHelp: () -> Unit,
) {
    var showPassword by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().background(Sz.Midnight).systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(Sz.gutter),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(32.dp))
        SztudioLogo(markSize = 56.dp, tagline = true, large = true)
        Spacer(Modifier.height(32.dp))

        SzCard(Modifier.widthIn(max = 480.dp).fillMaxWidth()) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Logowanie do Sztudio Core", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                if (reason != null) Notice(reason.userMessage, ok = false)

                OutlinedTextField(
                    value = state.server,
                    onValueChange = onServerChange,
                    label = { Text("Adres serwera") },
                    placeholder = { Text("https://192.168.1.10") },
                    supportingText = { Text(state.inputError ?: "Adres HTTPS panelu Sztudio w sieci domowej.") },
                    isError = state.inputError != null,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth().testTag("server"),
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = onTestServer, enabled = !state.testing && !state.busy && state.server.isNotBlank()) {
                        Text(if (state.testing) "Sprawdzanie…" else "Testuj połączenie")
                    }
                    if (state.serverOkMs != null) {
                        Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = Sz.Success, modifier = Modifier.size(18.dp))
                        Text("Serwer odpowiada (${state.serverOkMs} ms), certyfikat zaufany.", color = Sz.Success, fontSize = 12.sp)
                    }
                }

                OutlinedTextField(
                    value = state.username,
                    onValueChange = onUsernameChange,
                    label = { Text("Login") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth().testTag("username"),
                )
                OutlinedTextField(
                    value = state.password,
                    onValueChange = onPasswordChange,
                    label = { Text("Hasło") },
                    singleLine = true,
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onSubmit() }),
                    trailingIcon = {
                        IconButton(onClick = { showPassword = !showPassword }) {
                            Icon(
                                if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                contentDescription = if (showPassword) "Ukryj hasło" else "Pokaż hasło",
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth().testTag("password"),
                )

                state.error?.let { error ->
                    Notice(error.userMessage, ok = false)
                    if (error is AppError.UntrustedCertificate || error is AppError.CertificateHostMismatch) {
                        TextButton(onClick = onShowCaHelp) { Text("Jak zainstalować certyfikat CA Sztudio") }
                    }
                }
                if (state.lockSeconds > 0) Notice("Logowanie wstrzymane na ${state.lockSeconds} s po nieudanych próbach.", ok = false, icon = true)

                Button(onClick = onSubmit, enabled = state.canSubmit, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                    if (state.busy) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp), color = Sz.Ink)
                        Spacer(Modifier.size(10.dp))
                        Text("Logowanie…")
                    } else {
                        Text("Zaloguj")
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onShowCaHelp) { Text("Certyfikat CA – instrukcja instalacji", color = Sz.Muted) }
    }
}

@Composable
private fun Notice(text: String, ok: Boolean, icon: Boolean = false) {
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = text },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(if (icon) Icons.Outlined.Lock else Icons.Outlined.ErrorOutline, contentDescription = null, tint = if (ok) Sz.Success else Sz.Danger, modifier = Modifier.size(18.dp))
        Text(text, color = Sz.Ink, fontSize = 13.sp)
    }
}
