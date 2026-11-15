import type { SystemEvent } from '@/types/api';
import { formatLongDate, localDayKey } from '@/utils/format';
import { EventRow } from './EventRow';

function dayLabel(dayKey: string, sample: string): string {
  const today = localDayKey(new Date());
  const yesterday = localDayKey(new Date(Date.now() - 86_400_000));
  const long = formatLongDate(sample);
  if (dayKey === today) return `Dzisiaj · ${long}`;
  if (dayKey === yesterday) return `Wczoraj · ${long}`;
  return long.charAt(0).toUpperCase() + long.slice(1);
}

/** Grupuje zdarzenia (posortowane malejąco) według dnia w czasie lokalnym. */
export function groupEventsByDay(events: SystemEvent[]): Array<{ day: string; events: SystemEvent[] }> {
  const groups: Array<{ day: string; events: SystemEvent[] }> = [];
  for (const event of events) {
    const day = localDayKey(event.occurredAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.events.push(event);
    else groups.push({ day, events: [event] });
  }
  return groups;
}

/** Chronologiczna oś zdarzeń pogrupowana według dni. */
export function EventTimeline({ events }: { events: SystemEvent[] }) {
  const sorted = [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return (
    <div className="space-y-6 p-4">
      {groupEventsByDay(sorted).map((group) => (
        <section key={group.day} aria-label={dayLabel(group.day, group.events[0]!.occurredAt)}>
          <h3 className="label-caps mb-3 flex items-center gap-3">
            {dayLabel(group.day, group.events[0]!.occurredAt)}
            <span className="h-px flex-1 bg-line" />
            <span className="tabular">{group.events.length}</span>
          </h3>
          <ol className="relative space-y-4 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-line">
            {group.events.map((event) => (
              <li key={event.id} className="relative">
                <EventRow event={event} time="clock" showDescription />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
