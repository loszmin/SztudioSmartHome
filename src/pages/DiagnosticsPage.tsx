import { Cctv, HardDrive, RefreshCw, Stethoscope } from 'lucide-react';
import { Button } from '@/components/Button';
import { Card, CardHeader } from '@/components/Card';
import { EmptyState, QueryState } from '@/components/StateViews';
import { Badge, ConnectionBadge } from '@/components/Status';
import type { Tone } from '@/components/tone';
import { useCoreAction, useDiagnostics } from '@/hooks/useCoreData';
import { useDataSource } from '@/hooks/useCoreQuery';
import { useSettingsStore } from '@/stores/settingsStore';
import type { DeviceDiagnostics, Diagnostics, Go2rtcStatus, StreamRegistration } from '@/types/api';
import { formatDateTime, formatRelative } from '@/utils/format';

const GO2RTC: Record<Go2rtcStatus['state'], { tone: Tone; label: string }> = {
  running: { tone: 'success', label: 'Działa' },
  error: { tone: 'danger', label: 'Błąd' },
  not_configured: { tone: 'neutral', label: 'Nieskonfigurowany' },
};

const STREAM: Record<StreamRegistration, { tone: Tone; label: string }> = {
  registered: { tone: 'success', label: 'zarejestrowany' },
  not_configured: { tone: 'neutral', label: 'brak źródła' },
  disabled: { tone: 'neutral', label: 'wyłączony' },
  error: { tone: 'danger', label: 'błąd rejestracji' },
};

function streamText(device: DeviceDiagnostics): string | null {
  if (device.streamConsumers === undefined) return null;
  if (device.streamConsumers > 0) return `podgląd: ${device.streamConsumers}`;
  return device.streamConnected ? 'połączony ze źródłem' : 'bez odbiorców';
}

function Summary({ data }: { data: Diagnostics }) {
  const hour12 = useSettingsStore((state) => state.hour12);
  const go2rtc = GO2RTC[data.go2rtc.state];
  const offline = data.devices.filter((device) => device.enabled && device.status === 'offline').length;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card as="div" className="p-4">
        <div className="label-caps">go2rtc – strumienie wideo</div>
        <div className="mt-2 flex items-center gap-2">
          <Badge tone={go2rtc.tone} dot>{go2rtc.label}</Badge>
          {data.go2rtc.version && <span className="text-xs text-muted">wersja {data.go2rtc.version}</span>}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-silver">
          {data.go2rtc.state === 'running' && `Zarejestrowane strumienie: ${data.go2rtc.streams ?? 0}.`}
          {data.go2rtc.state === 'error' && (data.go2rtc.errorMessage ?? 'Usługa nie odpowiada.')}
          {data.go2rtc.state === 'not_configured' && 'Core nie ma ustawionego adresu go2rtc – podgląd obrazu jest niedostępny.'}
        </p>
        {data.go2rtc.errorCode && <p className="mt-1 font-mono text-[11px] text-muted">kod: {data.go2rtc.errorCode}</p>}
      </Card>
      <Card as="div" className="p-4">
        <div className="label-caps">Monitor urządzeń</div>
        <div className="mt-2">
          <Badge tone={data.monitor.enabled ? 'success' : 'neutral'} dot>
            {data.monitor.enabled ? `Co ${data.monitor.intervalSeconds} s` : 'Wyłączony'}
          </Badge>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-silver">
          {data.monitor.lastRunAt
            ? `Ostatnia kontrola: ${formatDateTime(data.monitor.lastRunAt, hour12)} (${data.monitor.lastDurationMs ?? 0} ms).`
            : 'Kontrola nie była jeszcze wykonana.'}
        </p>
      </Card>
      <Card as="div" className="p-4">
        <div className="label-caps">Urządzenia</div>
        <div className="tabular mt-2 text-2xl font-semibold text-ink">{data.devices.length}</div>
        <p className="mt-1 text-xs leading-relaxed text-silver">
          {offline > 0 ? <span className="text-danger">Bez połączenia: {offline}.</span> : 'Wszystkie włączone urządzenia odpowiadają.'}
        </p>
      </Card>
    </div>
  );
}

function DeviceRow({ device }: { device: DeviceDiagnostics }) {
  const hour12 = useSettingsStore((state) => state.hour12);
  const Icon = device.kind === 'camera' ? Cctv : HardDrive;
  const stream = device.streamState ? STREAM[device.streamState] : null;
  const time = (value?: string) =>
    value ? <time dateTime={value} title={formatDateTime(value, hour12)}>{formatRelative(value)}</time> : 'nigdy';

  return (
    <tr className="align-top hover:bg-raised/40">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 text-primary-soft" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{device.name}</div>
            <div className="truncate font-mono text-[11px] text-muted">{device.address ?? 'brak adresu'}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5">{device.enabled ? <ConnectionBadge status={device.status} /> : <Badge tone="neutral">Wyłączona</Badge>}</td>
      <td className="px-4 py-2.5 text-xs text-silver">{time(device.lastAttemptAt)}</td>
      <td className="px-4 py-2.5 text-xs text-silver">{time(device.lastSuccessAt)}</td>
      <td className="tabular px-4 py-2.5 text-xs text-silver">{device.responseTimeMs !== undefined ? `${device.responseTimeMs} ms` : '—'}</td>
      <td className="px-4 py-2.5 text-xs">
        {stream ? (
          <>
            <Badge tone={stream.tone}>{stream.label}</Badge>
            {streamText(device) && <div className="mt-1 text-muted">{streamText(device)}</div>}
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="max-w-xs px-4 py-2.5 text-xs">
        {device.errorCode ? (
          <>
            <div className="font-mono text-[11px] text-danger">{device.errorCode}</div>
            <div className="leading-relaxed text-silver">{device.errorMessage}</div>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

const COLUMNS = ['Urządzenie', 'Status', 'Ostatnia próba', 'Ostatnie połączenie', 'Czas odpowiedzi', 'Strumień', 'Błąd'];

export function DiagnosticsPage() {
  const { mode } = useDataSource();
  const diagnostics = useDiagnostics();
  const run = useCoreAction((api) => api.runDiagnostics(), {
    invalidate: ['diagnostics', 'cameras', 'recorders', 'system'],
    success: 'Kontrola urządzeń zakończona.',
    failure: 'Nie udało się uruchomić kontroli.',
  });

  if (mode === 'demo') {
    return (
      <EmptyState
        icon={Stethoscope}
        title="Diagnostyka wymaga połączenia z Sztudio Core"
        description="W trybie demonstracyjnym panel nie łączy się z żadnymi urządzeniami, więc nie ma czego diagnozować."
        className="py-24"
      />
    );
  }

  return (
    <div className="space-y-3 p-3 sm:p-4 lg:space-y-4 lg:p-6">
      <QueryState query={diagnostics} className="py-20">
        {(data) => (
          <>
            <Summary data={data} />
            <Card>
              <CardHeader
                title="Połączenia z urządzeniami"
                icon={Stethoscope}
                meta={data.devices.length}
                action={
                  <Button size="sm" icon={RefreshCw} disabled={run.isPending} onClick={() => run.mutate(undefined)}>
                    {run.isPending ? 'Sprawdzanie…' : 'Sprawdź teraz'}
                  </Button>
                }
              />
              {data.devices.length === 0 ? (
                <EmptyState icon={Stethoscope} title="Brak urządzeń" description="Dodaj kamerę lub rejestrator, aby zobaczyć stan połączeń." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[56rem] text-left">
                    <thead>
                      <tr className="border-b border-line">
                        {COLUMNS.map((column) => (
                          <th key={column} scope="col" className="label-caps px-4 py-2.5 font-semibold">{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.devices.map((device) => <DeviceRow key={`${device.kind}-${device.id}`} device={device} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}
