import { HardDrive } from 'lucide-react';
import { EmptyState, QueryState } from '@/components/StateViews';
import { ConnectionBadge } from '@/components/Status';
import { useCameras, useDevices } from '@/hooks/useCoreData';
import { formatRelative } from '@/utils/format';
import { InfoRow, Note, SettingsSection } from './SettingsSection';

export function BcsSection() {
  const devices = useDevices();
  const cameras = useCameras();
  const bcsCameras = cameras.data?.filter((camera) => camera.source === 'bcs').length;

  return (
    <SettingsSection id="bcs" title="Integracja BCS" description="Rejestrator BCS podłączony do Sztudio Core." icon={HardDrive}>
      <QueryState
        query={devices}
        loadingRows={3}
        className="!px-0"
        isEmpty={(data) => !data.some((device) => device.kind === 'recorder')}
        empty={
          <EmptyState
            icon={HardDrive}
            title="Nie skonfigurowano rejestratora"
            description="Sztudio Core nie zgłasza żadnego rejestratora BCS."
            className="py-6"
          />
        }
      >
        {(data) => (
          <div className="grid gap-x-8 lg:grid-cols-2">
            {data
              .filter((device) => device.kind === 'recorder')
              .map((recorder) => (
                <dl key={recorder.id} className="divide-y divide-line">
                  <InfoRow label="Urządzenie">{recorder.name}</InfoRow>
                  <InfoRow label="Status"><ConnectionBadge status={recorder.status} /></InfoRow>
                  <InfoRow label="Model">{recorder.model}</InfoRow>
                  <InfoRow label="Adres IP"><span className="font-mono text-[13px]">{recorder.ipAddress ?? '—'}</span></InfoRow>
                  <InfoRow label="Kanały">
                    {recorder.channels ?? '—'}
                    {bcsCameras !== undefined ? ` (kamery w panelu: ${bcsCameras})` : ''}
                  </InfoRow>
                  <InfoRow label="Ostatnia aktywność">{formatRelative(recorder.lastSeenAt)}</InfoRow>
                </dl>
              ))}
          </div>
        )}
      </QueryState>
      <div className="mt-4">
        <Note>
          Adres, login i hasło rejestratora konfiguruje się po stronie Sztudio Core – panel nie przechowuje danych logowania do
          urządzeń. Edycja integracji z poziomu panelu nie jest dostępna w wersji 1.0.
        </Note>
      </div>
    </SettingsSection>
  );
}
