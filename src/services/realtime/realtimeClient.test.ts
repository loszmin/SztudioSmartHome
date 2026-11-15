import { describe, expect, it } from 'vitest';
import { resolveGo2rtcBaseUrl } from '@/services/go2rtc/webrtc';
import { buildWebSocketUrl } from './realtimeClient';

describe('adresy usług czasu rzeczywistego', () => {
  it('zamienia adres HTTP(S) serwera na adres WebSocket', () => {
    expect(buildWebSocketUrl('http://10.0.0.5:8000', '/ws/v1/events')).toBe('ws://10.0.0.5:8000/ws/v1/events');
    expect(buildWebSocketUrl('https://dom.example', '/ws/v1/alarms')).toBe('wss://dom.example/ws/v1/alarms');
  });

  it('używa adresu panelu, gdy adres serwera jest pusty', () => {
    expect(buildWebSocketUrl('', '/ws/v1/system', 'https://panel.local')).toBe('wss://panel.local/ws/v1/system');
  });

  it('wyznacza adres go2rtc', () => {
    expect(resolveGo2rtcBaseUrl({ go2rtcUrl: '', serverUrl: 'http://10.0.0.5:8000/' })).toBe('http://10.0.0.5:8000/go2rtc');
    expect(resolveGo2rtcBaseUrl({ go2rtcUrl: 'http://10.0.0.5:1984/', serverUrl: '' })).toBe('http://10.0.0.5:1984');
    expect(resolveGo2rtcBaseUrl({ go2rtcUrl: '', serverUrl: '' })).toBe('/go2rtc');
  });
});
