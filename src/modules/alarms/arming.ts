import { Home, Shield, ShieldOff, type LucideIcon } from 'lucide-react';
import type { Tone } from '@/components/tone';
import type { ArmingMode } from '@/types/api';

export interface ArmingModeInfo {
  label: string;
  short: string;
  description: string;
  tone: Tone;
  icon: LucideIcon;
}

export const ARMING_MODES: Record<ArmingMode, ArmingModeInfo> = {
  disarmed: {
    label: 'Rozbrojony',
    short: 'Rozbrojony',
    description: 'Czujniki są monitorowane, ale nie wywołują alarmów włamaniowych.',
    tone: 'neutral',
    icon: ShieldOff,
  },
  armed_home: {
    label: 'Uzbrojony – tryb domowy',
    short: 'Tryb domowy',
    description: 'Chronione są drzwi, okna i strefy zewnętrzne. Ruch wewnątrz domu jest ignorowany.',
    tone: 'success',
    icon: Home,
  },
  armed_away: {
    label: 'Uzbrojony – pełna ochrona',
    short: 'Pełna ochrona',
    description: 'Aktywne są wszystkie czujniki, również ruchu wewnątrz domu.',
    tone: 'success',
    icon: Shield,
  },
};

export const ARMING_ORDER: ArmingMode[] = ['disarmed', 'armed_home', 'armed_away'];
