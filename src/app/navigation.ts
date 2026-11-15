import { Activity, Bell, Cctv, HardDrive, History, LayoutDashboard, Network, Settings, Stethoscope, type LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  /** Tytuł ekranu w górnym pasku. */
  title: string;
  icon: LucideIcon;
  /** Widoczny w dolnej nawigacji mobilnej (pozostałe trafiają do „Więcej”). */
  primary: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Start', title: 'Centrum monitoringu', icon: LayoutDashboard, primary: true },
  { path: '/kamery', label: 'Kamery', title: 'Monitoring kamer', icon: Cctv, primary: true },
  { path: '/alarmy', label: 'Alarmy', title: 'Alarmy', icon: Bell, primary: true },
  { path: '/czujniki', label: 'Czujniki', title: 'Czujniki', icon: Activity, primary: true },
  { path: '/rejestratory', label: 'Rejestratory', title: 'Rejestratory', icon: HardDrive, primary: false },
  { path: '/siec', label: 'Sieć', title: 'Sieć lokalna', icon: Network, primary: false },
  { path: '/historia', label: 'Historia', title: 'Historia zdarzeń', icon: History, primary: false },
  { path: '/diagnostyka', label: 'Diagnostyka', title: 'Diagnostyka Sztudio Core', icon: Stethoscope, primary: false },
  { path: '/ustawienia', label: 'Ustawienia', title: 'Ustawienia', icon: Settings, primary: false },
];

export const MORE_PATH = '/wiecej';

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => (item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)));
}
