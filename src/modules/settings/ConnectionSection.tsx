import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, PlugZap, Save, TriangleAlert, Unplug } from 'lucide-react';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/FormControls';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Badge } from '@/components/Status';
import type { Tone } from '@/components/tone';
import { createHttpCoreApi } from '@/services/api/coreApi';
import { describeError } from '@/services/api/httpClient';
import { useRealtimeStore, type RealtimeState } from '@/stores/realtimeStore';
import { isValidServerUrl, normalizeUrl, useSettingsStore, type DataMode } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import type { RealtimeChannelName } from '@/types/api';
import { Note, SettingsSection } from './SettingsSection';

type TestResult = { ok: true; message: string } | { ok: false; message: string } | null;

const CHANNEL_LABELS: Record<RealtimeChannelName, string> = {
  events: 'Zdarzenia',
  system: 'System',
  cameras: 'Kamery',
  alarms: 'Alarmy',
};

const CHANNEL_STATE: Record<RealtimeState, { tone: Tone; label: string }> = {
  idle: { tone: 'neutral', label: 'Nieaktywny' },
  connecting: { tone: 'warning', label: 'Łączenie' },
  open: { tone: 'success', label: 'Połączony' },
  closed: { tone: 'danger', label: 'Rozłączony' },
};

export function ConnectionSection() {
  const settings = useSettingsStore();
  const channels = useRealtimeStore((state) => state.channels);
  const [mode, setMode] = useState<DataMode>(settings.mode);
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [apiToken, setApiToken] = useState(settings.apiToken);
  const [testing, setTesting] = useState(false);

  // Logowanie / wylogowanie w innej sekcji zmienia zapisany token.
  useEffect(() => setApiToken(settings.apiToken), [settings.apiToken]);
  const [result, setResult] = useState<TestResult>(null);

  const urlValid = isValidServerUrl(serverUrl);
  const dirty = mode !== settings.mode || normalizeUrl(serverUrl) !== settings.serverUrl || apiToken.trim() !== settings.apiToken;

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!urlValid) return;
    const token = apiToken.trim();
    settings.update({
      mode,
      serverUrl: normalizeUrl(serverUrl),
      apiToken: token,
      // Ręczna zmiana tokenu oznacza, że nie pochodzi on już z logowania.
      authUsername: token === settings.apiToken ? settings.authUsername : '',
    });
    setServerUrl(normalizeUrl(serverUrl));
    toast.success(mode === 'demo' ? 'Zapisano. Panel działa w trybie demonstracyjnym.' : 'Zapisano ustawienia połączenia.');
  };

  const test = async () => {
    if (!urlValid) return;
    setTesting(true);
    setResult(null);
    try {
      const api = createHttpCoreApi({ baseUrl: normalizeUrl(serverUrl), token: apiToken.trim() || undefined, timeoutMs: 5000 });
      const status = await api.getSystemStatus();
      setResult({ ok: true, message: `Połączono z Sztudio Core ${status?.core?.version ?? ''} (${status?.core?.hostname ?? 'nieznany host'}).` });
    } catch (error) {
      setResult({ ok: false, message: describeError(error) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsSection
      id="polaczenie"
      title="Połączenie z Sztudio Core"
      description="Adres serwera w sieci lokalnej. Panel nie wymaga dostępu do internetu."
      icon={PlugZap}
    >
      <form onSubmit={save} className="space-y-4" noValidate>
        <div>
          <div className="mb-1.5 text-xs font-medium text-silver">Źródło danych</div>
          <SegmentedControl<DataMode>
            label="Źródło danych"
            value={mode}
            onChange={(value) => {
              setMode(value);
              setResult(null);
            }}
            options={[
              { value: 'demo', label: 'Tryb demonstracyjny' },
              { value: 'live', label: 'Sztudio Core' },
            ]}
          />
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {mode === 'demo'
              ? 'Panel pokazuje dane przykładowe. Obraz z kamer nie jest symulowany.'
              : 'Panel pobiera dane z serwera Sztudio Core przez REST API i WebSocket.'}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field
            label="Adres serwera"
            hint="Np. http://192.168.1.10:8000. Puste pole = adres, z którego otwarto panel."
            error={urlValid ? undefined : 'Podaj pełny adres zaczynający się od http:// lub https://.'}
          >
            {(field) => (
              <TextInput
                {...field}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="http://adres-serwera:port"
                value={serverUrl}
                onChange={(event) => {
                  setServerUrl(event.target.value);
                  setResult(null);
                }}
              />
            )}
          </Field>
          <Field label="Token API (opcjonalnie)" hint="Alternatywa dla logowania (sekcja „Użytkownicy i bezpieczeństwo”). Przechowywany lokalnie w tej przeglądarce.">
            {(field) => (
              <TextInput
                {...field}
                type="password"
                autoComplete="off"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" icon={Save} disabled={!dirty || !urlValid}>
            Zapisz
          </Button>
          <Button icon={testing ? undefined : Unplug} onClick={() => void test()} disabled={testing || !urlValid}>
            {testing ? 'Testowanie…' : 'Testuj połączenie'}
          </Button>
        </div>

        {result && (
          <p
            role="status"
            className={
              result.ok
                ? 'flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-xs text-ink'
                : 'flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs text-ink'
            }
          >
            {result.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <TriangleAlert className="h-4 w-4 shrink-0 text-danger" />}
            {result.message}
          </p>
        )}

        <div>
          <div className="label-caps mb-2">Kanały czasu rzeczywistego (WebSocket)</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CHANNEL_LABELS) as RealtimeChannelName[]).map((channel) => (
              <Badge key={channel} tone={CHANNEL_STATE[channels[channel]].tone} dot>
                {CHANNEL_LABELS[channel]}: {CHANNEL_STATE[channels[channel]].label}
              </Badge>
            ))}
          </div>
          {settings.mode === 'demo' && (
            <p className="mt-2 text-xs text-muted">W trybie demonstracyjnym kanały WebSocket nie są używane.</p>
          )}
        </div>

        {typeof window !== 'undefined' && window.location.protocol === 'https:' && serverUrl.trim().startsWith('http://') && (
          <Note>
            Panel jest otwarty przez HTTPS, a serwer ma adres HTTP – przeglądarka zablokuje takie połączenie. Udostępnij Sztudio Core
            przez HTTPS albo otwieraj panel z tego samego adresu co serwer.
          </Note>
        )}
      </form>
    </SettingsSection>
  );
}
