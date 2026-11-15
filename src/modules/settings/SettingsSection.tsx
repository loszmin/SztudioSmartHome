import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/Card';

interface SettingsSectionProps {
  id: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
}

export function SettingsSection({ id, title, description, icon: Icon, children }: SettingsSectionProps) {
  return (
    <Card id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4">
      <header className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
          <Icon className="h-[18px] w-[18px] text-primary-soft" />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
        </div>
      </header>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </Card>
  );
}

/** Wiersz „etykieta – wartość” w sekcjach informacyjnych. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-ink">{children}</dd>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-line bg-deep px-3 py-2.5 text-xs leading-relaxed text-silver/85">{children}</p>;
}
