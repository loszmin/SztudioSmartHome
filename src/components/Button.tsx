import type { ButtonHTMLAttributes, ComponentType } from 'react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ComponentType<{ className?: string }>;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white border-primary hover:bg-primary-soft hover:border-primary-soft',
  secondary: 'bg-raised text-ink border-line-strong hover:border-primary/60 hover:bg-primary/10',
  ghost: 'bg-transparent text-silver border-transparent hover:bg-raised hover:text-ink',
  danger: 'bg-danger/10 text-danger border-danger/40 hover:bg-danger/20',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

export function Button({ variant = 'secondary', size = 'md', icon: Icon, className, children, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg border font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ComponentType<{ className?: string }>;
  /** Etykieta dostępności i podpowiedź. */
  label: string;
  active?: boolean;
}

export function IconButton({ icon: Icon, label, active = false, className, type, ...props }: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'border-primary/50 bg-primary/15 text-primary-soft'
          : 'border-transparent text-silver hover:bg-raised hover:text-ink',
        className,
      )}
      {...props}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}
