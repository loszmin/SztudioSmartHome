import type { ReactNode } from 'react';
import type { ConnectionStatus, Severity } from '@/types/api';
import { cn } from '@/utils/cn';
import { severityLabel, severityTone, toneDot, toneSoft, type Tone } from './tone';

export function StatusDot({ tone, pulse = false, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)} aria-hidden="true">
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', toneDot[tone])} />}
      <span className={cn('relative h-2 w-2 rounded-full', toneDot[tone])} />
    </span>
  );
}

interface BadgeProps {
  tone: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}

export function Badge({ tone, children, dot = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium',
        toneSoft[tone],
        className,
      )}
    >
      {dot && <StatusDot tone={tone} />}
      {children}
    </span>
  );
}

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <Badge tone={status === 'online' ? 'success' : 'danger'} dot>
      {status === 'online' ? 'Online' : 'Offline'}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={severityTone[severity]}>{severityLabel[severity]}</Badge>;
}
