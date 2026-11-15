import { useState, type FormEvent } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/FormControls';
import { login } from '@/services/api/auth';
import { describeError } from '@/services/api/httpClient';
import { normalizeUrl, useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';

/** Logowanie do Sztudio Core: zamienia login i hasło na token dostępu zapisywany w ustawieniach. */
export function LoginForm() {
  const serverUrl = useSettingsStore((state) => state.serverUrl);
  const apiToken = useSettingsStore((state) => state.apiToken);
  const authUsername = useSettingsStore((state) => state.authUsername);
  const update = useSettingsStore((state) => state.update);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (apiToken) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink">
          {authUsername ? (
            <>Zalogowano jako <span className="font-semibold">{authUsername}</span>.</>
          ) : (
            'Panel używa ręcznie wpisanego tokenu API.'
          )}
        </p>
        <Button
          icon={LogOut}
          onClick={() => {
            update({ apiToken: '', authUsername: '' });
            toast.info('Wylogowano – usunięto token z tej przeglądarki.');
          }}
        >
          Wyloguj
        </Button>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await login(normalizeUrl(serverUrl), username.trim(), password);
      update({ apiToken: result.accessToken, authUsername: result.user.username });
      setPassword('');
      toast.success(`Zalogowano jako ${result.user.username}.`);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} aria-label="Logowanie do Sztudio Core" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <Field label="Login">
        {(field) => (
          <TextInput {...field} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        )}
      </Field>
      <Field label="Hasło">
        {(field) => (
          <TextInput
            {...field}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        )}
      </Field>
      <Button type="submit" variant="primary" icon={LogIn} disabled={pending || !username.trim() || !password}>
        {pending ? 'Logowanie…' : 'Zaloguj'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger sm:col-span-3">
          {error}
        </p>
      )}
    </form>
  );
}
