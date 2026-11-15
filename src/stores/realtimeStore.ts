import { create } from 'zustand';
import type { RealtimeChannelName } from '@/types/api';

export type RealtimeState = 'idle' | 'connecting' | 'open' | 'closed';

interface RealtimeStoreState {
  channels: Record<RealtimeChannelName, RealtimeState>;
  setChannel: (channel: RealtimeChannelName, state: RealtimeState) => void;
  reset: () => void;
}

const initial: Record<RealtimeChannelName, RealtimeState> = {
  events: 'idle',
  system: 'idle',
  cameras: 'idle',
  alarms: 'idle',
};

/** Stan kanałów WebSocket – prezentowany w Ustawieniach. */
export const useRealtimeStore = create<RealtimeStoreState>((set) => ({
  channels: initial,
  setChannel: (channel, state) =>
    set((current) => ({ channels: { ...current.channels, [channel]: state } })),
  reset: () => set({ channels: initial }),
}));
