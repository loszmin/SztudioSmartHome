import { BatteryFull, BatteryLow, BatteryMedium, Clock, MapPin } from 'lucide-react';
import { ConnectionBadge } from '@/components/Status';
import { toneSoft, toneText } from '@/components/tone';
import type { Sensor } from '@/types/api';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/format';
import { describeSensorState, SENSOR_TYPES } from './sensorMeta';

function Battery({ percent }: { percent: number }) {
  const Icon = percent <= 20 ? BatteryLow : percent <= 60 ? BatteryMedium : BatteryFull;
  return (
    <span className={cn('tabular inline-flex items-center gap-1', percent <= 20 ? 'text-warning' : 'text-muted')} title="Poziom baterii">
      <Icon className="h-3.5 w-3.5" />
      <span className="sr-only">Bateria: </span>
      {percent}%
    </span>
  );
}

export function SensorCard({ sensor }: { sensor: Sensor }) {
  const info = SENSOR_TYPES[sensor.type];
  const state = describeSensorState(sensor);
  const Icon = info.icon;

  return (
    <article aria-label={sensor.name} className="flex flex-col rounded-xl border border-line bg-navy p-4">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', toneSoft[state.tone === 'success' ? 'neutral' : state.tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink">{sensor.name}</h3>
          <p className="flex items-center gap-1 truncate text-xs text-muted">
            <MapPin className="h-3 w-3 shrink-0" />
            {sensor.location}
          </p>
        </div>
        <ConnectionBadge status={sensor.connection} />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="label-caps">Stan</div>
          <div className={cn('tabular truncate text-lg font-semibold', state.tone === 'success' ? 'text-ink' : toneText[state.tone])}>
            {state.text}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted">
          {typeof sensor.batteryPercent === 'number' && <Battery percent={sensor.batteryPercent} />}
          <span className="inline-flex items-center gap-1" title="Ostatnia aktualizacja">
            <Clock className="h-3 w-3" />
            <span className="sr-only">Ostatnia aktualizacja: </span>
            <time dateTime={sensor.lastUpdatedAt ?? undefined}>{formatRelative(sensor.lastUpdatedAt)}</time>
          </span>
        </div>
      </div>
    </article>
  );
}
