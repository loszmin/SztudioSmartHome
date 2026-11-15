import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusDot } from '@/components/Status';
import { toneText, type Tone } from '@/components/tone';
import { cn } from '@/utils/cn';

interface StatTileProps {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Wartość główna; undefined = dane jeszcze niedostępne. */
  value: string | undefined;
  detail?: string;
  tone: Tone;
  unavailable?: boolean;
  className?: string;
}

/** Kafel statusu na dashboardzie – prowadzi do odpowiedniego ekranu. */
export function StatTile({ to, icon: Icon, label, value, detail, tone, unavailable = false, className }: StatTileProps) {
  const loading = value === undefined && !unavailable;
  return (
    <Link
      to={to}
      className={cn('group flex min-w-0 flex-col rounded-xl border border-line bg-navy p-3.5 transition-colors hover:border-primary/50 sm:p-4', className)}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary-soft" />
        <span className="label-caps truncate">{label}</span>
        <StatusDot tone={unavailable ? 'neutral' : tone} className="ml-auto" />
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-24 animate-pulse rounded bg-raised" role="status" aria-label="Ładowanie" />
      ) : (
        <div className="tabular mt-2 truncate text-xl font-semibold text-ink sm:text-2xl">{unavailable ? '—' : value}</div>
      )}
      <div className={cn('mt-0.5 truncate text-xs', unavailable || tone === 'success' ? 'text-muted' : toneText[tone])}>
        {unavailable ? 'Brak danych' : loading ? ' ' : detail}
      </div>
    </Link>
  );
}
