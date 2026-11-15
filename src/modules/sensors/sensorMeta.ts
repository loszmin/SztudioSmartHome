import { AlarmSmoke, DoorOpen, Droplets, Radar, Thermometer, Vibrate, type LucideIcon } from 'lucide-react';
import type { Tone } from '@/components/tone';
import type { Sensor, SensorType } from '@/types/api';
import { formatNumber } from '@/utils/format';

interface SensorTypeInfo {
  label: string;
  icon: LucideIcon;
  idle: string;
  triggered: string;
  /** Ton stanu aktywnego. */
  triggeredTone: Tone;
}

export const SENSOR_TYPES: Record<SensorType, SensorTypeInfo> = {
  motion: { label: 'Ruch', icon: Radar, idle: 'Brak ruchu', triggered: 'Wykryto ruch', triggeredTone: 'primary' },
  contact: { label: 'Drzwi i okna', icon: DoorOpen, idle: 'Zamknięte', triggered: 'Otwarte', triggeredTone: 'warning' },
  flood: { label: 'Zalanie', icon: Droplets, idle: 'Sucho', triggered: 'Wykryto zalanie', triggeredTone: 'danger' },
  smoke: { label: 'Dym', icon: AlarmSmoke, idle: 'Brak dymu', triggered: 'Wykryto dym', triggeredTone: 'danger' },
  temperature: { label: 'Temperatura', icon: Thermometer, idle: 'W normie', triggered: 'Poza zakresem', triggeredTone: 'warning' },
  vibration: { label: 'Wibracje', icon: Vibrate, idle: 'Brak wibracji', triggered: 'Wykryto wibracje', triggeredTone: 'warning' },
};

export const SENSOR_TYPE_ORDER = Object.keys(SENSOR_TYPES) as SensorType[];

/** Aktualny stan czujnika w postaci tekstu i tonu kolorystycznego. */
export function describeSensorState(sensor: Sensor): { text: string; tone: Tone } {
  if (sensor.connection === 'offline') return { text: 'Brak danych', tone: 'neutral' };
  const info = SENSOR_TYPES[sensor.type];
  const triggered = sensor.state === 'triggered';
  const tone: Tone = triggered ? info.triggeredTone : 'success';
  if (sensor.value !== undefined) {
    return { text: `${formatNumber(sensor.value, 1)} ${sensor.unit ?? ''}`.trim(), tone };
  }
  return { text: triggered ? info.triggered : info.idle, tone };
}
