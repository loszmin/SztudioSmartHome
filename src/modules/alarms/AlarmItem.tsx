import { Check, CheckCheck, Clock, MapPin, Radio } from 'lucide-react';
import { Button } from '@/components/Button';
import { Badge, SeverityBadge } from '@/components/Status';
import { severityTone, toneDot } from '@/components/tone';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Alarm, AlarmSourceType } from '@/types/api';
import { cn } from '@/utils/cn';
import { formatDateTime, formatRelative } from '@/utils/format';

const SOURCE_LABELS: Record<AlarmSourceType, string> = {
  sensor: 'Czujnik',
  camera: 'Kamera',
  network: 'Sieć',
  system: 'System',
};

interface AlarmItemProps {
  alarm: Alarm;
  onAcknowledge?: (id: string) => void;
  acknowledging?: boolean;
}

export function AlarmItem({ alarm, onAcknowledge, acknowledging = false }: AlarmItemProps) {
  const hour12 = useSettingsStore((state) => state.hour12);
  const active = alarm.status === 'active';

  return (
    <article aria-label={alarm.title} className="relative flex flex-col gap-3 py-3.5 pl-5 pr-4 sm:flex-row sm:items-center">
      <span className={cn('absolute inset-y-3 left-0 w-[3px] rounded-r', active ? toneDot[severityTone[alarm.severity]] : 'bg-line-strong')} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{alarm.title}</h3>
          <SeverityBadge severity={alarm.severity} />
          {alarm.status === 'acknowledged' && <Badge tone="neutral"><Check className="h-3 w-3" />Potwierdzony</Badge>}
          {alarm.status === 'resolved' && <Badge tone="neutral"><CheckCheck className="h-3 w-3" />Zakończony</Badge>}
        </div>
        {alarm.description && <p className="mt-1 text-xs leading-relaxed text-silver/80">{alarm.description}</p>}
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <div className="flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5" />
            <dt className="sr-only">Źródło</dt>
            <dd>{SOURCE_LABELS[alarm.source.type]}: <span className="text-silver">{alarm.source.name}</span></dd>
          </div>
          {alarm.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <dt className="sr-only">Lokalizacja</dt>
              <dd>{alarm.location}</dd>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <dt className="sr-only">Czas zdarzenia</dt>
            <dd className="tabular">
              <time dateTime={alarm.triggeredAt}>{formatDateTime(alarm.triggeredAt, hour12)}</time>
              {active && ` (${formatRelative(alarm.triggeredAt)})`}
            </dd>
          </div>
        </dl>
      </div>
      {active && onAcknowledge && (
        <Button size="sm" variant="primary" icon={Check} disabled={acknowledging} onClick={() => onAcknowledge(alarm.id)} className="self-start sm:self-center">
          {acknowledging ? 'Potwierdzanie…' : 'Potwierdź'}
        </Button>
      )}
    </article>
  );
}
