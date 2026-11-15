import { useState } from 'react';
import { Activity } from 'lucide-react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState, QueryState } from '@/components/StateViews';
import { useSensors } from '@/hooks/useCoreData';
import { SensorCard } from '@/modules/sensors/SensorCard';
import { SENSOR_TYPE_ORDER, SENSOR_TYPES } from '@/modules/sensors/sensorMeta';
import type { Sensor, SensorType } from '@/types/api';

type Filter = SensorType | 'all';

function SensorGroups({ sensors, filter }: { sensors: Sensor[]; filter: Filter }) {
  const types = filter === 'all' ? SENSOR_TYPE_ORDER : [filter];
  const groups = types
    .map((type) => ({ type, items: sensors.filter((sensor) => sensor.type === type) }))
    .filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return <EmptyState icon={Activity} title="Brak czujników w tej kategorii" className="py-16" />;
  }

  return (
    <div className="space-y-5">
      {groups.map(({ type, items }) => {
        const info = SENSOR_TYPES[type];
        return (
          <section key={type} aria-label={info.label}>
            <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-ink">
              <info.icon className="h-4 w-4 text-primary-soft" />
              {info.label}
              <span className="tabular text-xs font-normal text-muted">{items.length}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((sensor) => (
                <SensorCard key={sensor.id} sensor={sensor} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function SensorsPage() {
  const sensors = useSensors();
  const [filter, setFilter] = useState<Filter>('all');
  const count = (type: SensorType) => sensors.data?.filter((sensor) => sensor.type === type).length ?? 0;

  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-6">
      <SegmentedControl<Filter>
        label="Kategoria czujników"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `Wszystkie${sensors.data ? ` (${sensors.data.length})` : ''}` },
          ...SENSOR_TYPE_ORDER.map((type) => ({
            value: type as Filter,
            label: `${SENSOR_TYPES[type].label}${sensors.data ? ` (${count(type)})` : ''}`,
          })),
        ]}
      />
      <QueryState
        query={sensors}
        isEmpty={(data) => data.length === 0}
        empty={<EmptyState icon={Activity} title="Brak czujników" description="Sztudio Core nie zwrócił żadnego czujnika." className="py-16" />}
        className="py-16"
      >
        {(data) => <SensorGroups sensors={data} filter={filter} />}
      </QueryState>
    </div>
  );
}
