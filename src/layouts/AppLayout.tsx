import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/Toaster';
import { useAlarmNotifications } from '@/hooks/useAlarmNotifications';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useSettingsStore } from '@/stores/settingsStore';
import { BottomNav } from './BottomNav';
import { ConnectionBanner } from './ConnectionBanner';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** Główny układ: panel boczny (desktop), pasek statusu, obszar roboczy, dolna nawigacja (telefon). */
export function AppLayout() {
  const density = useSettingsStore((state) => state.density);
  const apiToken = useSettingsStore((state) => state.apiToken);
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  useRealtimeSync();
  useAlarmNotifications();

  // Zalogowanie lub wylogowanie – dane trzeba pobrać ponownie od razu, nie przy następnym odświeżeniu.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['core'] });
  }, [apiToken, queryClient]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden bg-midnight text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Przejdź do treści
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <ConnectionBanner />
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] outline-none lg:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <Toaster />
    </div>
  );
}
