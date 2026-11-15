import { Cctv, HardDrive, MonitorSmartphone, Router, Server, Workflow, type LucideIcon } from 'lucide-react';
import type { NetworkDeviceType } from '@/types/api';

export const NETWORK_TYPES: Record<NetworkDeviceType, { label: string; plural: string; icon: LucideIcon }> = {
  core: { label: 'Sztudio Core', plural: 'Sztudio Core', icon: Server },
  recorder: { label: 'Rejestrator', plural: 'Rejestratory', icon: HardDrive },
  camera: { label: 'Kamera IP', plural: 'Kamery IP', icon: Cctv },
  router: { label: 'Router', plural: 'Routery', icon: Router },
  switch: { label: 'Switch', plural: 'Switche', icon: Workflow },
  other: { label: 'Inne', plural: 'Pozostałe', icon: MonitorSmartphone },
};

export const NETWORK_TYPE_ORDER = Object.keys(NETWORK_TYPES) as NetworkDeviceType[];
