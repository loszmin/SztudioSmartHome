import { useState, type FormEvent } from 'react';
import { PlugZap, Save } from 'lucide-react';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Field, Select, TextInput } from '@/components/FormControls';
import { ResultBox } from '@/components/ResultBox';
import { useCoreAction } from '@/hooks/useCoreData';
import { describeError } from '@/services/api/httpClient';
import type { Recorder, RecorderInput, RecorderProbe, RecorderSeries } from '@/types/api';
import { ProtocolChecks } from './ProtocolChecks';
import { SERIES_LABELS } from './recorderMeta';

interface FormState {
  name: string;
  series: RecorderSeries;
  ipAddress: string;
  port: string;
  rtspPort: string;
  onvifPort: string;
  username: string;
  password: string;
  channels: string;
  rtspPathTemplate: string;
}

const number = (value: string): number | null => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

function initialState(recorder?: Recorder): FormState {
  return {
    name: recorder?.name ?? '',
    series: recorder?.series ?? 'bcs_point',
    ipAddress: recorder?.ipAddress ?? '',
    port: String(recorder?.port ?? 80),
    rtspPort: String(recorder?.rtspPort ?? 554),
    onvifPort: String(recorder?.onvifPort ?? 80),
    username: recorder?.username ?? '',
    password: '',
    channels: recorder?.channels ? String(recorder.channels) : '',
    rtspPathTemplate: recorder?.rtspPathTemplate ?? '',
  };
}

function toInput(form: FormState, editing: boolean): RecorderInput {
  const input: RecorderInput = {
    name: form.name.trim(),
    series: form.series,
    ipAddress: form.ipAddress.trim() || null,
    port: number(form.port),
    rtspPort: number(form.rtspPort),
    onvifPort: number(form.onvifPort),
    username: form.username.trim() || null,
    channels: number(form.channels),
    rtspPathTemplate: form.rtspPathTemplate.trim() || null,
  };
  if (form.password !== '' || !editing) input.password = form.password;
  return input;
}

/** Dodawanie i edycja rejestratora wraz z testem połączenia (weryfikacja protokołów). */
export function RecorderFormDialog({ recorder, onClose }: { recorder?: Recorder; onClose: () => void }) {
  const editing = recorder !== undefined;
  const [form, setForm] = useState<FormState>(() => initialState(recorder));
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<RecorderProbe | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setProbe(null);
    setError(null);
  };

  const test = useCoreAction((api, input: FormState) =>
    api.testRecorder({
      recorderId: recorder?.id,
      series: input.series,
      ipAddress: input.ipAddress.trim(),
      port: number(input.port),
      rtspPort: number(input.rtspPort),
      onvifPort: number(input.onvifPort),
      username: input.username.trim() || null,
      password: input.password || undefined,
    }),
  );
  const save = useCoreAction(
    (api, input: FormState) => (editing ? api.updateRecorder(recorder.id, toInput(input, true)) : api.createRecorder(toInput(input, false))),
    { invalidate: ['recorders', 'devices', 'diagnostics', 'cameras'], success: (saved) => `Zapisano rejestrator „${saved.name}”.` },
  );

  const runTest = () => {
    if (!form.ipAddress.trim()) return setError('Podaj adres IP rejestratora.');
    setError(null);
    test.mutate(form, { onSuccess: setProbe, onError: (cause) => setError(describeError(cause)) });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setError('Podaj nazwę rejestratora.');
    if (!form.ipAddress.trim()) return setError('Podaj adres IP rejestratora.');
    save.mutate(form, { onSuccess: onClose, onError: (cause) => setError(describeError(cause)) });
  };

  const busy = test.isPending || save.isPending;

  return (
    <Dialog
      title={editing ? 'Edycja rejestratora' : 'Dodaj rejestrator'}
      description="Hasło jest szyfrowane w Sztudio Core i nie jest później wyświetlane."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button icon={PlugZap} onClick={runTest} disabled={busy}>
            {test.isPending ? 'Testowanie…' : 'Testuj połączenie'}
          </Button>
          <Button type="submit" form="recorder-form" variant="primary" icon={Save} disabled={busy}>
            {save.isPending ? 'Zapisywanie…' : 'Zapisz'}
          </Button>
        </>
      }
    >
      <form id="recorder-form" onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nazwa rejestratora">
            {(field) => <TextInput {...field} value={form.name} onChange={(event) => set('name', event.target.value)} autoFocus={!editing} />}
          </Field>
          <Field label="Seria" hint="Wybór adaptera. Obecnie każda seria korzysta z protokołów standardowych (ONVIF, RTSP).">
            {(field) => (
              <Select {...field} value={form.series} onChange={(event) => set('series', event.target.value as RecorderSeries)}>
                {(Object.keys(SERIES_LABELS) as RecorderSeries[]).map((series) => (
                  <option key={series} value={series}>{SERIES_LABELS[series]}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_6.5rem_6.5rem_6.5rem]">
          <Field label="Adres IP">
            {(field) => (
              <TextInput {...field} value={form.ipAddress} onChange={(event) => set('ipAddress', event.target.value)} autoComplete="off" spellCheck={false} placeholder="192.168.1.20" />
            )}
          </Field>
          <Field label="Port HTTP">
            {(field) => <TextInput {...field} value={form.port} onChange={(event) => set('port', event.target.value)} inputMode="numeric" />}
          </Field>
          <Field label="Port RTSP">
            {(field) => <TextInput {...field} value={form.rtspPort} onChange={(event) => set('rtspPort', event.target.value)} inputMode="numeric" />}
          </Field>
          <Field label="Port ONVIF">
            {(field) => <TextInput {...field} value={form.onvifPort} onChange={(event) => set('onvifPort', event.target.value)} inputMode="numeric" />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Login">
            {(field) => <TextInput {...field} value={form.username} onChange={(event) => set('username', event.target.value)} autoComplete="off" />}
          </Field>
          <Field label="Hasło" hint={editing && recorder.hasPassword ? 'Zapisane. Zostaw puste, aby nie zmieniać.' : undefined}>
            {(field) => (
              <TextInput {...field} type="password" value={form.password} onChange={(event) => set('password', event.target.value)} autoComplete="new-password" />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field label="Liczba kanałów">
            {(field) => <TextInput {...field} value={form.channels} onChange={(event) => set('channels', event.target.value)} inputMode="numeric" />}
          </Field>
          <Field
            label="Szablon ścieżki RTSP (opcjonalnie)"
            hint="Używany tylko, gdy kanałów nie da się odczytać przez ONVIF. Format z instrukcji modelu; {channel} = numer kanału, {subtype} = 0 (główny) / 1 (pomocniczy)."
          >
            {(field) => (
              <TextInput {...field} value={form.rtspPathTemplate} onChange={(event) => set('rtspPathTemplate', event.target.value)} autoComplete="off" spellCheck={false} />
            )}
          </Field>
        </div>

        {error && <ResultBox ok={false} title="Nie można wykonać operacji">{error}</ResultBox>}
        {probe && (
          <div className="space-y-2">
            <ResultBox ok={probe.code === 'ok'} title={probe.message}>
              {probe.device && [probe.device.manufacturer, probe.device.model, probe.device.firmware && `firmware ${probe.device.firmware}`].filter(Boolean).join(' · ')}
              {!probe.hardwareVerified && (
                <span className="block">Adapter tej serii nie był jeszcze sprawdzany z rzeczywistym rejestratorem.</span>
              )}
            </ResultBox>
            <ProtocolChecks checks={probe.checks} detailed />
          </div>
        )}
      </form>
    </Dialog>
  );
}
