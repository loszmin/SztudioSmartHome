import { afterEach, describe, expect, it, vi } from 'vitest';
import { reconnectDelay, RECONNECT_DELAYS_MS } from '@/modules/cameras/useCameraStream';
import { openCameraStream } from './webrtc';

/** Atrapa RTCPeerConnection rejestrująca przebieg negocjacji. */
export class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  iceGatheringState = 'complete';
  connectionState = 'new';
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  transceivers: Array<[string, unknown]> = [];
  closed = false;
  config: unknown;
  private listeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(config: unknown) {
    this.config = config;
    FakePeerConnection.instances.push(this);
  }
  addTransceiver(kind: string, init: unknown) {
    this.transceivers.push([kind, init]);
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  removeEventListener() {}
  async createOffer() {
    return { type: 'offer', sdp: 'v=0\r\noffer\r\n' };
  }
  async setLocalDescription(description: { type: string; sdp: string }) {
    this.localDescription = description;
  }
  async setRemoteDescription(description: { type: string; sdp: string }) {
    this.remoteDescription = description;
  }
  close() {
    this.closed = true;
  }
  emitState(state: string) {
    this.connectionState = state;
    this.listeners.connectionstatechange?.forEach((listener) => listener({}));
  }
}

class FakeMediaStream {
  tracks: unknown[] = [];
  addTrack(track: unknown) {
    this.tracks.push(track);
  }
}

describe('sygnalizacja WebRTC przez Sztudio Core', () => {
  afterEach(() => {
    FakePeerConnection.instances = [];
  });

  it('wysyła ofertę do Core i ustawia odpowiedź – bez serwerów STUN/TURN', async () => {
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    vi.stubGlobal('MediaStream', FakeMediaStream);
    const webrtcOffer = vi.fn(async () => 'v=0\r\nanswer\r\n');

    const session = await openCameraStream({ webrtcOffer }, 'cam-1');
    const peer = FakePeerConnection.instances[0]!;
    expect(webrtcOffer).toHaveBeenCalledWith('cam-1', 'v=0\r\noffer\r\n', undefined);
    expect(peer.remoteDescription).toEqual({ type: 'answer', sdp: 'v=0\r\nanswer\r\n' });
    expect(peer.config).toEqual({ iceServers: [] });
    expect(peer.transceivers.map(([kind, init]) => [kind, (init as { direction: string }).direction])).toEqual([
      ['video', 'recvonly'],
      ['audio', 'recvonly'],
    ]);
    session.close();
    expect(peer.closed).toBe(true);
  });

  it('zamyka połączenie, gdy Core odrzuci ofertę', async () => {
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    vi.stubGlobal('MediaStream', FakeMediaStream);
    const webrtcOffer = vi.fn(async () => Promise.reject(new Error('go2rtc nie odpowiada')));
    await expect(openCameraStream({ webrtcOffer }, 'cam-1')).rejects.toThrow('go2rtc nie odpowiada');
    expect(FakePeerConnection.instances[0]!.closed).toBe(true);
  });

  it('zgłasza brak obsługi WebRTC w przeglądarce', async () => {
    vi.stubGlobal('RTCPeerConnection', undefined);
    await expect(openCameraStream({ webrtcOffer: vi.fn() }, 'cam-1')).rejects.toThrow(/nie obsługuje WebRTC/);
  });

  it('wydłuża odstęp kolejnych prób ponownego połączenia', () => {
    expect([1, 2, 3, 4, 5, 9].map(reconnectDelay)).toEqual([...RECONNECT_DELAYS_MS, RECONNECT_DELAYS_MS.at(-1)]);
  });
});
