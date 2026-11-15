import { useState } from 'react';
import { History, ShieldCheck, Siren } from 'lucide-react';
import { Card, CardHeader } from '@/components/Card';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState, QueryState } from '@/components/StateViews';
import { StatusDot } from '@/components/Status';
import { severityLabel, severityTone } from '@/components/tone';
import { useAcknowledgeAlarm, useAlarms } from '@/hooks/useCoreData';
import { AlarmItem } from '@/modules/alarms/AlarmItem';
import { ArmingPanel } from '@/modules/alarms/ArmingPanel';
import type { Alarm, Severity } from '@/types/api';

type Tab = 'active' | 'history';
const SEVERITIES: Severity[] = ['critical', 'warning', 'info'];
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

function SeveritySummary({ alarms }: { alarms: Alarm[] }) {
  return (
    <Card>
      <CardHeader title="Aktywne wg ważności" icon={Siren} />
      <ul className="divide-y divide-line">
        {SEVERITIES.map((severity) => (
          <li key={severity} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
            <StatusDot tone={severityTone[severity]} />
            <span className="text-silver">{severityLabel[severity]}</span>
            <span className="tabular ml-auto font-semibold text-ink">
              {alarms.filter((alarm) => alarm.severity === severity).length}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AlarmsPage() {
  const alarms = useAlarms();
  const acknowledge = useAcknowledgeAlarm();
  const [tab, setTab] = useState<Tab>('active');

  const all = alarms.data ?? [];
  const active = all
    .filter((alarm) => alarm.status === 'active')
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.triggeredAt.localeCompare(a.triggeredAt));
  const history = all
    .filter((alarm) => alarm.status !== 'active')
    .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
  const visible = tab === 'active' ? active : history;

  return (
    <div className="grid items-start gap-3 p-3 sm:p-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-4 lg:p-6">
      <div className="grid gap-3 lg:gap-4">
        <ArmingPanel />
        <div className="max-lg:hidden">
          <SeveritySummary alarms={active} />
        </div>
      </div>

      <Card>
        <CardHeader
          title={tab === 'active' ? 'Aktywne alarmy' : 'Historia alarmów'}
          icon={tab === 'active' ? Siren : History}
          meta={alarms.data ? visible.length : undefined}
          action={
            <SegmentedControl<Tab>
              label="Zakres alarmów"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'active', label: `Aktywne${alarms.data ? ` (${active.length})` : ''}` },
                { value: 'history', label: 'Historia' },
              ]}
            />
          }
        />
        <QueryState
          query={alarms}
          isEmpty={() => visible.length === 0}
          empty={
            tab === 'active' ? (
              <EmptyState icon={ShieldCheck} title="Brak aktywnych alarmów" description="Wszystkie alarmy zostały potwierdzone. Zakończone zdarzenia znajdziesz w historii." />
            ) : (
              <EmptyState icon={History} title="Historia alarmów jest pusta" />
            )
          }
        >
          {() => (
            <ul className="divide-y divide-line">
              {visible.map((alarm) => (
                <li key={alarm.id}>
                  <AlarmItem
                    alarm={alarm}
                    onAcknowledge={(id) => acknowledge.mutate(id)}
                    acknowledging={acknowledge.isPending && acknowledge.variables === alarm.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Card>
    </div>
  );
}
