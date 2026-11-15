import type { ReactNode } from 'react';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { cn } from '@/utils/cn';

/** Wynik operacji (np. testu połączenia) – zielony lub czerwony panel z opisem. */
export function ResultBox({ ok, title, children }: { ok: boolean; title: string; children?: ReactNode }) {
  const Icon = ok ? CheckCircle2 : TriangleAlert;
  return (
    <div
      role="status"
      className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm', ok ? 'border-success/30 bg-success/10' : 'border-danger/30 bg-danger/10')}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ok ? 'text-success' : 'text-danger')} />
      <div className="min-w-0">
        <p className="font-medium text-ink">{title}</p>
        {children && <div className="mt-0.5 text-xs leading-relaxed text-silver">{children}</div>}
      </div>
    </div>
  );
}
