import { ChevronRight, ShieldCheck, Siren } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardHeader } from '@/components/Card';
import { EmptyState, QueryState } from '@/components/StateViews';
import { SeverityBadge, StatusDot } from '@/components/Status';
import { severityTone } from '@/components/tone';
import { useAlarms } from '@/hooks/useCoreData';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/format';

export function ActiveAlarmsCard({ className }: { className?: string }) {
  const alarms = useAlarms();
  const active = alarms.data?.filter((alarm) => alarm.status === 'active');

  return (
    <Card className={cn('flex min-h-0 flex-col', className)}>
      <CardHeader
        title="Aktywne alarmy"
        icon={Siren}
        meta={active?.length}
        action={
          <Link to="/alarmy" className="inline-flex items-center gap-0.5 text-xs font-medium text-primary-soft hover:text-ink">
            Wszystkie
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <QueryState
          query={alarms}
          loadingRows={3}
          isEmpty={(data) => !data.some((alarm) => alarm.status === 'active')}
          empty={<EmptyState icon={ShieldCheck} title="Brak aktywnych alarmów" description="System nie zgłasza żadnych zagrożeń." className="py-6" />}
        >
          {() => (
            <ul className="divide-y divide-line">
              {active?.map((alarm) => (
                <li key={alarm.id}>
                  <Link to="/alarmy" className="flex items-start gap-3 px-4 py-2.5 hover:bg-raised/50">
                    <StatusDot tone={severityTone[alarm.severity]} pulse={alarm.severity === 'critical'} className="mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{alarm.title}</p>
                      <p className="truncate text-xs text-muted">
                        {alarm.source.name} · {formatRelative(alarm.triggeredAt)}
                      </p>
                    </div>
                    <SeverityBadge severity={alarm.severity} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </div>
    </Card>
  );
}
