import { Cctv } from 'lucide-react';
import { Field, Select, TextInput } from '@/components/FormControls';
import { EmptyState, QueryState } from '@/components/StateViews';
import { ConnectionBadge } from '@/components/Status';
import { useCameras } from '@/hooks/useCoreData';
import { resolveGo2rtcBaseUrl } from '@/services/go2rtc/webrtc';
import { isValidServerUrl, normalizeUrl, useSettingsStore, type CameraLayout } from '@/stores/settingsStore';
import { SettingsSection } from './SettingsSection';

export function CamerasSection() {
  const cameras = useCameras();
  const settings = useSettingsStore();
  const go2rtcValid = isValidServerUrl(settings.go2rtcUrl);
  const effective = resolveGo2rtcBaseUrl(settings) || '/go2rtc';

  return (
    <SettingsSection
      id="kamery"
      title="Konfiguracja kamer"
      description="Ustawienia podglądu w tym panelu. Lista kamer i strumieni pochodzi z Sztudio Core."
      icon={Cctv}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Domyślny układ monitoringu">
          {(field) => (
            <Select {...field} value={settings.defaultLayout} onChange={(event) => settings.update({ defaultLayout: Number(event.target.value) as CameraLayout })}>
              <option value={1}>1 kamera</option>
              <option value={4}>4 kamery</option>
              <option value={6}>6 kamer</option>
              <option value={9}>9 kamer</option>
            </Select>
          )}
        </Field>
        <Field label="Kamery na ekranie Start">
          {(field) => (
            <Select {...field} value={settings.dashboardCameraCount} onChange={(event) => settings.update({ dashboardCameraCount: Number(event.target.value) as 2 | 4 })}>
              <option value={2}>2 kamery</option>
              <option value={4}>4 kamery</option>
            </Select>
          )}
        </Field>
        <Field
          label="Adres go2rtc"
          className="sm:col-span-2 lg:col-span-1"
          hint={<>Puste pole = przez Sztudio Core. Używany adres: <span className="font-mono">{effective}</span></>}
          error={go2rtcValid ? undefined : 'Podaj pełny adres zaczynający się od http:// lub https://.'}
        >
          {(field) => (
            <TextInput
              {...field}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="http://adres-go2rtc:1984"
              value={settings.go2rtcUrl}
              onChange={(event) => settings.update({ go2rtcUrl: event.target.value })}
              onBlur={() => settings.update({ go2rtcUrl: normalizeUrl(settings.go2rtcUrl) })}
            />
          )}
        </Field>
      </div>

      <div className="label-caps mb-1 mt-5">Kamery zgłoszone przez Sztudio Core</div>
      <QueryState
        query={cameras}
        loadingRows={3}
        className="!px-0"
        isEmpty={(data) => data.length === 0}
        empty={<EmptyState icon={Cctv} title="Brak kamer" className="py-6" />}
      >
        {(data) => (
          <ul className="divide-y divide-line">
            {data.map((camera) => (
              <li key={camera.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="tabular w-10 shrink-0 font-mono text-xs text-muted">
                  {camera.channel !== undefined ? `CH${camera.channel}` : '—'}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{camera.name}</span>
                <span className="hidden truncate font-mono text-xs text-muted sm:block">{camera.streamName}</span>
                <ConnectionBadge status={camera.status} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </SettingsSection>
  );
}
