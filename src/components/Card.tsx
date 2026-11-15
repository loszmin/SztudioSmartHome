import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article';
}

export function Card({ as: Tag = 'section', className, ...props }: CardProps) {
  return <Tag className={cn('rounded-xl border border-line bg-navy', className)} {...props} />;
}

interface CardHeaderProps {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  /** Licznik lub krótka informacja obok tytułu. */
  meta?: ReactNode;
  action?: ReactNode;
}

export function CardHeader({ title, icon: Icon, meta, action }: CardHeaderProps) {
  return (
    <header className="flex min-h-12 items-center gap-2.5 border-b border-line px-4 py-2.5">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-soft" />}
      <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
      {meta !== undefined && <span className="tabular text-xs text-muted">{meta}</span>}
      {action && <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
