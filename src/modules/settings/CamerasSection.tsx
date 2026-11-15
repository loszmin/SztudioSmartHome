import { Cctv } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Field, Select } from '@/components/FormControls';
import { EmptyState, QueryState } from '@/components/StateViews';
import { ConnectionBadge } from '@/components/Status';
import { useCameras } from '@/hooks/useCoreData';
import { useSettingsStore, type CameraLayout } from '@/stores/settingsStore';
import { SettingsSection } from './SettingsSection';

export function CamerasSection() {
  const cameras = useCameras();
  const settings = useSettingsStore();

  return (
    <SettingsSection
      id="kamery"
      title="Konfiguracja kamer"
      description="Ustawienia podglądu w tym panelu. Kamery dodaje się i edytuje na ekranie Kamery."
      icon={Cctv}
    >
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        Obraz jest pobierany przez Sztudio Core (WebRTC). Panel nie łączy się bezpośrednio z kamerami ani z go2rtc.{' '}
        <Link to="/kamery" className="font-medium text-primary-soft hover:text-ink">Zarządzaj kamerami</Link>
      </p>
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
