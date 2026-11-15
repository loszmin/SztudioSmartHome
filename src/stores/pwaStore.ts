import { create } from 'zustand';

/** Zdarzenie `beforeinstallprompt` (Chromium) – brak w standardowych typach DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  installEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  install: () => Promise<boolean>;
}

export const usePwaStore = create<PwaState>((set, get) => ({
  installEvent: null,
  installed: false,
  install: async () => {
    const event = get().installEvent;
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    set({ installEvent: null });
    return choice.outcome === 'accepted';
  },
}));

/** Rejestruje nasłuchiwanie zdarzeń instalacji PWA – wywoływane raz przy starcie. */
export function initPwaInstallListeners(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    usePwaStore.setState({ installEvent: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwaStore.setState({ installed: true, installEvent: null }));
}

export function isStandalone(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
}
