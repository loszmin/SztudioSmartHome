import type { Severity } from '@/types/api';

export type Tone = 'success' | 'warning' | 'danger' | 'primary' | 'neutral';

export const toneText: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  primary: 'text-primary-soft',
  neutral: 'text-muted',
};

export const toneDot: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  primary: 'bg-primary',
  neutral: 'bg-muted',
};

export const toneSoft: Record<Tone, string> = {
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
  danger: 'bg-danger/10 text-danger border-danger/30',
  primary: 'bg-primary/10 text-primary-soft border-primary/30',
  neutral: 'bg-silver/5 text-silver border-line-strong',
};

export const severityTone: Record<Severity, Tone> = {
  info: 'primary',
  warning: 'warning',
  critical: 'danger',
};

export const severityLabel: Record<Severity, string> = {
  info: 'Informacja',
  warning: 'Ostrzeżenie',
  critical: 'Krytyczny',
};
