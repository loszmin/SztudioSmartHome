import { ChevronRight, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardHeader } from '@/components/Card';
import { EmptyState, QueryState } from '@/components/StateViews';
import { useEvents } from '@/hooks/useCoreData';
import { EventRow } from '@/modules/events/EventRow';
import { cn } from '@/utils/cn';

const RECENT_LIMIT = 8;

export function RecentEventsCard({ className }: { className?: string }) {
  const events = useEvents({ limit: RECENT_LIMIT });

  return (
    <Card className={cn('flex min-h-0 flex-col', className)}>
      <CardHeader
        title="Ostatnie zdarzenia"
        icon={History}
        action={
          <Link to="/historia" className="inline-flex items-center gap-0.5 text-xs font-medium text-primary-soft hover:text-ink">
            Historia
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <QueryState
          query={events}
          isEmpty={(data) => data.length === 0}
          empty={<EmptyState icon={History} title="Brak zdarzeń" description="Nie zarejestrowano jeszcze żadnych zdarzeń." className="py-6" />}
        >
          {(data) => (
            <ul className="divide-y divide-line">
              {data.slice(0, RECENT_LIMIT).map((event) => (
                <li key={event.id} className="px-4 py-2.5">
                  <EventRow event={event} />
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </div>
    </Card>
  );
}
