import { useEffect, useState, type FormEvent } from 'react';
import { PlugZap, Save, ScanSearch } from 'lucide-react';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Field, Select, Switch, TextInput } from '@/components/FormControls';
import { ResultBox } from '@/components/ResultBox';
import { SegmentedControl } from '@/components/SegmentedControl';
import { LoadingState } from '@/components/StateViews';
import { useCoreAction } from '@/hooks/useCoreData';
import { useDataSource } from '@/hooks/useCoreQuery';
import { describeError } from '@/services/api/httpClient';
import { getCoreApi } from '@/services/coreApiProvider';
import type { CameraConfig, OnvifDevice, OnvifProfile, ProbeResult } from '@/types/api';
import {
  EMPTY_CAMERA_FORM,
  formFromConfig,
  toCameraInput,
  toTestInput,
  validateCameraForm,
  type CameraFormState,
} from './cameraForm';

interface CameraFormDialogProps {
  /** Identyfikator edytowanej kamery; brak = dodawanie nowej. */
  cameraId?: string;
  /** Wartości początkowe (np. z wykrywania ONVIF). */
  initial?: Partial<CameraFormState>;
  onClose: () => void;
}

/** Dodawanie i edycja kamery: źródło RTSP, test połączenia, profile ONVIF. */
export function CameraFormDialog({ cameraId, initial, onClose }: CameraFormDialogProps) {
  const source = useDataSource();
  const editing = cameraId !== undefined;
  const [form, setForm] = useState<CameraFormState>({ ...EMPTY_CAMERA_FORM, ...initial });
  const [config, setConfig] = useState<CameraConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [onvif, setOnvif] = useState<OnvifDevice | null>(null);

  const set = <K extends keyof CameraFormState>(key: K, value: CameraFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setProbe(null);
    setError(null);
  };

  useEffect(() => {
    if (!cameraId) return;
    let cancelled = false;
    getCoreApi(source)
      .getCameraConfig(cameraId)
      .then((loaded) => {
        if (cancelled) return;
        setConfig(loaded);
        setForm(formFromConfig(loaded));
      })
      .catch((cause: unknown) => !cancelled && setLoadError(describeError(cause)));
    return () => {
      cancelled = true;
    };
    // Konfiguracja jest wczytywana raz, przy otwarciu okna.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  const inherits = Boolean(config?.recorderId) && !form.host.trim();
  const test = useCoreAction((api, input: CameraFormState) => api.testCamera(toTestInput(input, cameraId)));
  const inspect = useCoreAction((api, input: CameraFormState) =>
    api.inspectOnvif({
      host: input.host.trim(),
      port: Number.parseInt(input.onvifPort, 10) || 80,
      username: input.username.trim() || undefined,
      password: input.password || undefined,
      cameraId,
    }),
  );
  const save = useCoreAction(
    (api, input: CameraFormState) =>
      editing ? api.updateCamera(cameraId, toCameraInput(input, true)) : api.createCamera(toCameraInput(input, false)),
    {
      invalidate: ['cameras', 'devices', 'diagnostics'],
      success: (saved) =>
        saved.status === 'online'
          ? `Zapisano kamerę „${saved.name}” – połączenie działa.`
          : `Zapisano kamerę „${saved.name}”. Brak połączenia: ${saved.errorMessage ?? 'sprawdź konfigurację.'}`,
    },
  );

  const runTest = () => {
    const problem = validateCameraForm({ ...form, name: form.name || '-' }, inherits);
    if (problem) return setError(problem);
    setError(null);
    test.mutate(form, { onSuccess: setProbe, onError: (cause) => setError(describeError(cause)) });
  };

  const loadProfiles = () => {
    if (!form.host.trim()) return setError('Podaj adres IP kamery, aby wczytać profile ONVIF.');
    setError(null);
    inspect.mutate(form, { onSuccess: setOnvif, onError: (cause) => setError(describeError(cause)) });
  };

  const applyProfile = (profile: OnvifProfile) => {
    setForm((current) => ({
      ...current,
      source: 'onvif',
      entry: 'fields',
      rtspPort: String(profile.rtspPort ?? 554),
      rtspPath: profile.rtspPath ?? '',
      streamProfile: profile.name,
      resolution: profile.resolution ?? '',
      fps: profile.fps ? String(profile.fps) : '',
      vendor: onvif?.manufacturer ?? current.vendor,
      model: onvif?.model ?? current.model,
    }));
    setProbe(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = validateCameraForm(form, inherits);
    if (problem) return setError(problem);
    save.mutate(form, { onSuccess: onClose, onError: (cause) => setError(describeError(cause)) });
  };

  const busy = save.isPending || test.isPending || inspect.isPending;

  return (
    <Dialog
      title={editing ? 'Edycja kamery' : 'Dodaj kamerę'}
      description="Adres i dane logowania trafiają wyłącznie do Sztudio Core. Hasło jest szyfrowane i nie jest później wyświetlane."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Anuluj</Button>
          <Button icon={PlugZap} onClick={runTest} disabled={busy || (editing && !config)}>
            {test.isPending ? 'Testowanie…' : 'Testuj połączenie'}
          </Button>
          <Button type="submit" form="camera-form" variant="primary" icon={Save} disabled={busy || (editing && !config)}>
            {save.isPending ? 'Zapisywanie…' : 'Zapisz'}
          </Button>
        </>
      }
    >
      {loadError ? (
        <ResultBox ok={false} title="Nie udało się wczytać konfiguracji kamery">{loadError}</ResultBox>
      ) : editing && !config ? (
        <LoadingState rows={5} className="!p-0" />
      ) : (
        <form id="camera-form" onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nazwa kamery">
              {(field) => <TextInput {...field} value={form.name} onChange={(event) => set('name', event.target.value)} autoFocus={!editing} />}
            </Field>
            <Field label="Lokalizacja">
              {(field) => <TextInput {...field} value={form.location} onChange={(event) => set('location', event.target.value)} placeholder="np. Front domu" />}
            </Field>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-silver">Sposób podania źródła</div>
            <SegmentedControl<CameraFormState['entry']>
              label="Sposób podania źródła"
              value={form.entry}
              onChange={(value) => set('entry', value)}
              options={[
                { value: 'fields', label: 'Adres IP i ścieżka' },
                { value: 'url', label: 'Pełny adres RTSP' },
              ]}
            />
          </div>

          {form.entry === 'url' ? (
            <Field
              label="Adres RTSP"
              hint="Np. rtsp://login:hasło@192.168.1.64:554/stream1. Adres zostanie rozłożony na pola, a hasło zaszyfrowane."
            >
              {(field) => (
                <TextInput {...field} value={form.rtspUrl} onChange={(event) => set('rtspUrl', event.target.value)} autoComplete="off" spellCheck={false} placeholder="rtsp://" />
              )}
            </Field>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Field label="Adres IP kamery" hint={inherits ? 'Puste = adres rejestratora, do którego podłączona jest kamera.' : undefined}>
                  {(field) => (
                    <TextInput {...field} value={form.host} onChange={(event) => set('host', event.target.value)} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="192.168.1.64" />
                  )}
                </Field>
                <Field label="Port RTSP">
                  {(field) => <TextInput {...field} value={form.rtspPort} onChange={(event) => set('rtspPort', event.target.value)} inputMode="numeric" />}
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Login" hint={inherits ? 'Puste = dane logowania rejestratora.' : undefined}>
                  {(field) => <TextInput {...field} value={form.username} onChange={(event) => set('username', event.target.value)} autoComplete="off" />}
                </Field>
                <Field label="Hasło" hint={editing && config?.hasPassword ? 'Zapisane. Zostaw puste, aby nie zmieniać.' : undefined}>
                  {(field) => (
                    <TextInput {...field} type="password" value={form.password} onChange={(event) => set('password', event.target.value)} autoComplete="new-password" />
                  )}
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                <Field label="Ścieżka strumienia RTSP" hint="Z instrukcji kamery, np. /stream1 – albo wczytaj profile ONVIF poniżej.">
                  {(field) => (
                    <TextInput {...field} value={form.rtspPath} onChange={(event) => set('rtspPath', event.target.value)} autoComplete="off" spellCheck={false} placeholder="/stream1" />
                  )}
                </Field>
                <Field label="Profil strumienia">
                  {(field) => (
                    <Select {...field} value={form.streamProfile} onChange={(event) => set('streamProfile', event.target.value)}>
                      <option value="main">Główny</option>
                      <option value="sub">Pomocniczy</option>
                      {!['main', 'sub'].includes(form.streamProfile) && <option value={form.streamProfile}>{form.streamProfile || '—'}</option>}
                    </Select>
                  )}
                </Field>
              </div>

              <div className="rounded-lg border border-line bg-deep p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Port ONVIF" className="w-28">
                    {(field) => <TextInput {...field} value={form.onvifPort} onChange={(event) => set('onvifPort', event.target.value)} inputMode="numeric" />}
                  </Field>
                  <Button icon={ScanSearch} onClick={loadProfiles} disabled={busy}>
                    {inspect.isPending ? 'Łączenie z kamerą…' : 'Wczytaj profile ONVIF'}
                  </Button>
                  <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
                    Odczytuje z kamery producenta, model i adresy strumieni. Wymaga włączonego ONVIF i jego danych logowania.
                  </p>
                </div>
                {onvif && (
                  <div className="mt-3">
                    <p className="text-xs text-silver">
                      {[onvif.manufacturer, onvif.model, onvif.firmware && `firmware ${onvif.firmware}`].filter(Boolean).join(' · ') || 'Urządzenie ONVIF'}
                    </p>
                    <ul aria-label="Profile ONVIF" className="mt-2 divide-y divide-line rounded-lg border border-line">
                      {onvif.profiles.length === 0 && <li className="px-3 py-2 text-xs text-muted">Urządzenie nie zgłosiło żadnego profilu.</li>}
                      {onvif.profiles.map((profile) => (
                        <li key={profile.token} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink">{profile.name}</p>
                            <p className="truncate text-xs text-muted">
                              {[profile.encoding, profile.resolution, profile.fps && `${profile.fps} kl./s`].filter(Boolean).join(' · ') || '—'}
                              {profile.error ? ` · ${profile.error}` : ''}
                            </p>
                          </div>
                          <Button size="sm" disabled={!profile.rtspPath} onClick={() => applyProfile(profile)}>
                            {form.rtspPath === profile.rtspPath && profile.rtspPath ? 'Wybrany' : 'Użyj'}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          <Switch
            label="Kamera włączona"
            description="Wyłączona kamera nie jest monitorowana ani udostępniana do podglądu."
            checked={form.enabled}
            onChange={(enabled) => set('enabled', enabled)}
          />

          {error && <ResultBox ok={false} title="Nie można wykonać operacji">{error}</ResultBox>}
          {probe && (
            <ResultBox ok={probe.ok} title={probe.ok ? 'Połączenie działa' : 'Brak połączenia'}>
              {probe.message}
              {probe.responseTimeMs !== undefined && ` Czas odpowiedzi: ${probe.responseTimeMs} ms.`}
              {probe.tracks.length > 0 && ` Strumień: ${probe.tracks.map((track) => `${track.media} ${track.codec}`).join(', ')}.`}
              {!probe.ok && <span className="block font-mono text-[11px] text-muted">kod: {probe.code}</span>}
            </ResultBox>
          )}
        </form>
      )}
    </Dialog>
  );
}
