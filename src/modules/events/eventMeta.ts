import { DoorOpen, PersonStanding, RotateCw, Siren, VideoOff, Wifi, type LucideIcon } from 'lucide-react';
import type { EventCategory } from '@/types/api';

export const EVENT_CATEGORIES: Record<EventCategory, { label: string; icon: LucideIcon }> = {
  motion: { label: 'Wykrycie ruchu', icon: PersonStanding },
  camera_offline: { label: 'Utrata połączenia z kamerą', icon: VideoOff },
  device_online: { label: 'Powrót urządzenia online', icon: Wifi },
  door: { label: 'Drzwi i okna', icon: DoorOpen },
  alarm: { label: 'Alarm', icon: Siren },
  restart: { label: 'Restart urządzenia', icon: RotateCw },
};

export const EVENT_CATEGORY_ORDER = Object.keys(EVENT_CATEGORIES) as EventCategory[];
