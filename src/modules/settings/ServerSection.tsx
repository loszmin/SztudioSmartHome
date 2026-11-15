import { Server } from 'lucide-react';
import { Field, Select } from '@/components/FormControls';
import { QueryState } from '@/components/StateViews';
import { Badge } from '@/components/Status';
import type { Tone } from '@/components/tone';
import { useSystemStatus } from '@/hooks/useCoreData';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ServiceState } from '@/types/api';
import { cn } from '@/utils/cn';
import { formatUptime } from '@/utils/format';
import { InfoRow, SettingsSection } from './SettingsSection';

const SERVICE: Record<ServiceState, { tone: Tone; label: string }> = {
  running: { tone: 'success', label: 'Działa' },
  stopped: { tone: 'neutral', label: 'Zatrzymana' },
  error: { tone: 'danger', label: 'Błąd' },
};

function Meter({ label, percent }: { label: string; percent: number }) {
  const value = Math.max(0, Math.min(100, percent));
  const color = value >= 90 ? 'bg-danger' : value >= 75 ? 'bg-warning' : 'bg-primary';
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular font-medium text-ink">{Math.round(value)}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-deep"
      >
        <div className={cn('h-full rounded-full', color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

const REFRESH_OPTIONS = [5, 10, 30, 60];

export function ServerSection() {
  const system = useSystemStatus();
  const refreshIntervalSec = useSettingsStore((state) => state.refreshIntervalSec);
  const update = useSettingsStore((state) => state.update);

  return (
    <SettingsSection id="serwer" title="Konfiguracja serwera" description="Stan Sztudio Core i jego usług oraz częstotliwość odświeżania danych w panelu." icon={Server}>
      <QueryState query={system} loadingRows={3} className="!px-0 !py-4">
        {(status) => (
          <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
            <div>
              <dl className="divide-y divide-line">
                <InfoRow label="Nazwa hosta"><span className="font-mono text-[13px]">{status.core.hostname}</span></InfoRow>
                <InfoRow label="Wersja Core">{status.core.version}</InfoRow>
                <InfoRow label="Czas pracy">{formatUptime(status.core.uptimeSeconds)}</InfoRow>
              </dl>
              <div className="mt-3 grid gap-3">
                <Meter label="Procesor" percent={status.resources.cpuPercent} />
                <Meter label="Pamięć" percent={status.resources.memoryPercent} />
                <Meter label="Dysk" percent={status.resources.diskPercent} />
              </div>
            </div>
            <div>
              <div className="label-caps mb-1">Usługi</div>
              <ul className="divide-y divide-line">
                {status.services.map((service) => (
                  <li key={service.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate text-ink">{service.name}</span>
                    <Badge tone={SERVICE[service.state].tone} dot>{SERVICE[service.state].label}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </QueryState>

      <Field label="Odświeżanie danych" hint="Jak często panel pobiera aktualny stan z Sztudio Core." className="mt-4 max-w-xs">
        {(field) => (
          <Select {...field} value={refreshIntervalSec} onChange={(event) => update({ refreshIntervalSec: Number(event.target.value) })}>
            {REFRESH_OPTIONS.map((seconds) => (
              <option key={seconds} value={seconds}>co {seconds} s</option>
            ))}
          </Select>
        )}
      </Field>
    </SettingsSection>
  );
}
