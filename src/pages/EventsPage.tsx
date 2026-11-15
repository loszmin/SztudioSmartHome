import { useState } from 'react';
import { FilterX, History } from 'lucide-react';
import { Button } from '@/components/Button';
import { Card, CardHeader } from '@/components/Card';
import { Field, Select, TextInput } from '@/components/FormControls';
import { EmptyState, QueryState } from '@/components/StateViews';
import { useEvents } from '@/hooks/useCoreData';
import { EVENT_CATEGORIES, EVENT_CATEGORY_ORDER } from '@/modules/events/eventMeta';
import { EventTimeline } from '@/modules/events/EventTimeline';
import type { EventCategory, EventsQuery } from '@/types/api';
import { localDayKey } from '@/utils/format';

/** Zamienia daty z pól formularza (czas lokalny) na zakres ISO dla API. */
export function buildEventsQuery(category: EventCategory | '', from: string, to: string): EventsQuery {
  return {
    category: category || undefined,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
  };
}

export function EventsPage() {
  const [category, setCategory] = useState<EventCategory | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const invalidRange = from !== '' && to !== '' && from > to;
  const events = useEvents(buildEventsQuery(category, invalidRange ? '' : from, invalidRange ? '' : to));
  const filtered = category !== '' || from !== '' || to !== '';
  const today = localDayKey(new Date());

  const reset = () => {
    setCategory('');
    setFrom('');
    setTo('');
  };

  return (
    <div className="space-y-3 p-3 sm:p-4 lg:space-y-4 lg:p-6">
      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[minmax(0,16rem)_11rem_11rem_auto]">
          <Field label="Kategoria" className="col-span-2 lg:col-span-1">
            {(field) => (
              <Select {...field} value={category} onChange={(event) => setCategory(event.target.value as EventCategory | '')}>
                <option value="">Wszystkie kategorie</option>
                {EVENT_CATEGORY_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {EVENT_CATEGORIES[value].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Od dnia">
            {(field) => <TextInput {...field} type="date" max={to || today} value={from} onChange={(event) => setFrom(event.target.value)} />}
          </Field>
          <Field label="Do dnia">
            {(field) => <TextInput {...field} type="date" min={from || undefined} max={today} value={to} onChange={(event) => setTo(event.target.value)} />}
          </Field>
          <Button icon={FilterX} onClick={reset} disabled={!filtered} className="col-span-2 lg:col-span-1 lg:justify-self-start">
            Wyczyść filtry
          </Button>
        </div>
        {invalidRange && (
          <p role="alert" className="mt-2 text-xs text-danger">
            Data początkowa jest późniejsza niż końcowa – zakres dat został pominięty.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Oś zdarzeń" icon={History} meta={events.data ? events.data.length : undefined} />
        <QueryState
          query={events}
          loadingRows={6}
          isEmpty={(data) => data.length === 0}
          empty={
            <EmptyState
              icon={History}
              title={filtered ? 'Brak zdarzeń dla wybranych filtrów' : 'Brak zdarzeń'}
              description={filtered ? 'Zmień kategorię lub zakres dat.' : 'Nie zarejestrowano jeszcze żadnych zdarzeń.'}
              action={filtered ? <Button size="sm" icon={FilterX} onClick={reset}>Wyczyść filtry</Button> : undefined}
            />
          }
        >
          {(data) => <EventTimeline events={data} />}
        </QueryState>
      </Card>
    </div>
  );
}
