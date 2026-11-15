import { StatusDot } from '@/components/Status';
import type { Tone } from '@/components/tone';
import { useConnection, type ConnectionState } from '@/hooks/useConnection';
import { useSystemStatus } from '@/hooks/useCoreData';
import type { SystemStatus } from '@/types/api';
import { formatUptime } from '@/utils/format';

export interface CoreStatusSummary {
  tone: Tone;
  label: string;
  detail: string;
}

export function summarizeCoreStatus(state: ConnectionState, status: SystemStatus | undefined): CoreStatusSummary {
  if (state === 'offline') return { tone: 'danger', label: 'Brak połączenia', detail: 'Serwer nie odpowiada' };
  if (state === 'connecting' || !status) return { tone: 'neutral', label: 'Łączenie…', detail: 'Oczekiwanie na serwer' };
  const version = `v${status.core.version}`;
  if (state === 'demo') return { tone: 'primary', label: 'Tryb demo', detail: 'Dane przykładowe' };
  if (status.core.state === 'degraded') return { tone: 'warning', label: 'Ograniczona praca', detail: version };
  if (status.core.state === 'offline') return { tone: 'danger', label: 'Offline', detail: version };
  return { tone: 'success', label: 'Online', detail: `${version} · ${formatUptime(status.core.uptimeSeconds)}` };
}

export function useCoreStatusSummary(): CoreStatusSummary {
  const connection = useConnection();
  const { data } = useSystemStatus();
  return summarizeCoreStatus(connection.state, data);
}

/** Status Sztudio Core – stopka panelu bocznego. */
export function CoreStatus({ compact = false }: { compact?: boolean }) {
  const summary = useCoreStatusSummary();

  if (compact) {
    return (
      <div
        className="flex h-10 items-center justify-center"
        title={`Sztudio Core: ${summary.label}`}
        aria-label={`Sztudio Core: ${summary.label}`}
      >
        <StatusDot tone={summary.tone} pulse={summary.tone === 'success'} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-navy px-3 py-2.5">
      <div className="label-caps">Sztudio Core</div>
      <div className="mt-1.5 flex items-center gap-2">
        <StatusDot tone={summary.tone} pulse={summary.tone === 'success'} />
        <span className="truncate text-sm font-medium text-ink">{summary.label}</span>
      </div>
      <div className="tabular mt-0.5 truncate pl-4 text-xs text-muted">{summary.detail}</div>
    </div>
  );
}
