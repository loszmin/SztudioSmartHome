import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WS_PATHS } from '@/services/api/endpoints';
import { buildWebSocketUrl, RealtimeClient } from '@/services/realtime/realtimeClient';
import { useRealtimeStore } from '@/stores/realtimeStore';
import type { RealtimeChannelName } from '@/types/api';
import { coreQueryKey, useDataSource } from './useCoreQuery';

/** Zasoby do odświeżenia po komunikacie na danym kanale. */
const CHANNEL_RESOURCES: Record<RealtimeChannelName, string[]> = {
  events: ['events'],
  system: ['system', 'network', 'devices', 'recorders', 'diagnostics'],
  cameras: ['cameras', 'diagnostics'],
  alarms: ['alarms', 'sensors', 'system'],
};

/**
 * W trybie „live” utrzymuje połączenia WebSocket z Sztudio Core i po każdym
 * komunikacie odświeża powiązane zapytania. W trybie demo nie robi nic.
 */
export function useRealtimeSync(): void {
  const source = useDataSource();
  const queryClient = useQueryClient();
  const { mode, serverUrl, apiToken } = source;

  useEffect(() => {
    const store = useRealtimeStore.getState();
    if (mode !== 'live' || typeof WebSocket === 'undefined') {
      store.reset();
      return;
    }
    const current = { mode, serverUrl, apiToken };

    const clients = (Object.keys(WS_PATHS) as RealtimeChannelName[]).map((channel) => {
      let url: string;
      try {
        url = buildWebSocketUrl(serverUrl, WS_PATHS[channel]);
      } catch {
        return null;
      }
      if (apiToken) url += `?token=${encodeURIComponent(apiToken)}`;

      const client = new RealtimeClient({
        url,
        onStateChange: (state) => useRealtimeStore.getState().setChannel(channel, state),
        onMessage: () => {
          for (const resource of CHANNEL_RESOURCES[channel]) {
            void queryClient.invalidateQueries({ queryKey: coreQueryKey(current, resource) });
          }
        },
      });
      client.start();
      return client;
    });

    return () => {
      clients.forEach((client) => client?.stop());
      useRealtimeStore.getState().reset();
    };
  }, [mode, serverUrl, apiToken, queryClient]);
}
