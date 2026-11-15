import type { ComponentType, ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Inbox, RefreshCw, ServerOff, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { describeError } from '@/services/api/httpClient';
import { cn } from '@/utils/cn';
import { Button } from './Button';

export function LoadingState({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Ładowanie danych" className={cn('space-y-2.5 p-4', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-lg bg-raised/70" />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon: Icon = Inbox, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-deep">
        <Icon className="h-5 w-5 text-muted" />
      </div>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-danger/30 bg-danger/10">
        <ServerOff className="h-5 w-5 text-danger" />
      </div>
      <p className="mt-3 text-sm font-medium text-ink">Nie udało się pobrać danych</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{describeError(error)}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button size="sm" icon={RefreshCw} onClick={onRetry}>
            Spróbuj ponownie
          </Button>
        )}
        <Link
          to="/ustawienia"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-silver hover:bg-raised hover:text-ink"
        >
          <Settings className="h-4 w-4" />
          Ustawienia połączenia
        </Link>
      </div>
    </div>
  );
}

interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  /** Uznaje dane za puste – wtedy wyświetlany jest `empty`. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loadingRows?: number;
  className?: string;
}

/** Wspólna obsługa stanów zapytania: ładowanie, błąd, brak danych. */
export function QueryState<T>({ query, children, isEmpty, empty, loadingRows, className }: QueryStateProps<T>) {
  if (query.data !== undefined) {
    if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="Brak danych" className={className} />}</>;
    return <>{children(query.data)}</>;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} className={className} />;
  }
  return <LoadingState rows={loadingRows} className={className} />;
}
