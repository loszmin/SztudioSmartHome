import { severityTone, toneSoft } from '@/components/tone';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SystemEvent } from '@/types/api';
import { cn } from '@/utils/cn';
import { formatRelative, formatTime } from '@/utils/format';
import { EVENT_CATEGORIES } from './eventMeta';

interface EventRowProps {
  event: SystemEvent;
  /** `relative` – „5 min temu” (dashboard); `clock` – godzina (oś czasu). */
  time?: 'relative' | 'clock';
  showDescription?: boolean;
}

export function EventRow({ event, time = 'relative', showDescription = false }: EventRowProps) {
  const hour12 = useSettingsStore((state) => state.hour12);
  const meta = EVENT_CATEGORIES[event.category];
  const Icon = meta.icon;

  return (
    <div className="flex items-start gap-3">
      <span className="relative shrink-0 rounded-lg bg-navy" title={meta.label}>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg border', toneSoft[severityTone[event.severity]])}>
          <Icon className="h-4 w-4" />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{event.title}</p>
        <p className="truncate text-xs text-muted">{event.source}</p>
        {showDescription && event.description && (
          <p className="mt-1 text-xs leading-relaxed text-silver/80">{event.description}</p>
        )}
      </div>
      <time dateTime={event.occurredAt} className="tabular shrink-0 pt-0.5 text-xs text-muted">
        {time === 'relative' ? formatRelative(event.occurredAt) : formatTime(event.occurredAt, hour12)}
      </time>
    </div>
  );
}
