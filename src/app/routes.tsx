import type { RouteObject } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { AlarmsPage } from '@/pages/AlarmsPage';
import { CamerasPage } from '@/pages/CamerasPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DiagnosticsPage } from '@/pages/DiagnosticsPage';
import { EventsPage } from '@/pages/EventsPage';
import { MorePage } from '@/pages/MorePage';
import { NetworkPage } from '@/pages/NetworkPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RecordersPage } from '@/pages/RecordersPage';
import { SensorsPage } from '@/pages/SensorsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { MORE_PATH } from './navigation';

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/kamery', element: <CamerasPage /> },
      { path: '/alarmy', element: <AlarmsPage /> },
      { path: '/czujniki', element: <SensorsPage /> },
      { path: '/rejestratory', element: <RecordersPage /> },
      { path: '/siec', element: <NetworkPage /> },
      { path: '/diagnostyka', element: <DiagnosticsPage /> },
      { path: '/historia', element: <EventsPage /> },
      { path: '/ustawienia', element: <SettingsPage /> },
      { path: MORE_PATH, element: <MorePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
