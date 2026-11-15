import type { RealtimeMessage } from '@/types/api';

export type SocketState = 'connecting' | 'open' | 'closed';

export interface RealtimeClientOptions {
  url: string;
  onMessage: (message: RealtimeMessage) => void;
  onStateChange?: (state: SocketState) => void;
  /** Maksymalny odstęp między próbami ponownego połączenia. */
  maxBackoffMs?: number;
}

/** Zamienia adres HTTP(S) Sztudio Core na adres WebSocket dla podanej ścieżki. */
export function buildWebSocketUrl(serverUrl: string, path: string, origin = window.location.origin): string {
  const base = new URL(serverUrl || origin);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${base.origin}${path}`;
}

/** Połączenie WebSocket z automatycznym wznawianiem (wykładniczy odstęp prób). */
export class RealtimeClient {
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private stopped = false;

  constructor(private readonly options: RealtimeClientOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  private connect(): void {
    if (this.stopped) return;
    this.options.onStateChange?.('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.options.onStateChange?.('open');
    };
    socket.onmessage = (event) => {
      try {
        const parsed: unknown = JSON.parse(String(event.data));
        if (parsed && typeof parsed === 'object' && 'type' in parsed) {
          this.options.onMessage(parsed as RealtimeMessage);
        }
      } catch {
        // Komunikaty spoza kontraktu są pomijane.
      }
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped) return;
      this.options.onStateChange?.('closed');
      this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const max = this.options.maxBackoffMs ?? 30_000;
    const delay = Math.min(max, 1000 * 2 ** this.attempts);
    this.attempts += 1;
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }
}
