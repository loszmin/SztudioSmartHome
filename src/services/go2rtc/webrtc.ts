/**
 * Klient WebRTC dla go2rtc.
 *
 * Korzysta z punktu `POST {go2rtc}/api/webrtc?src={strumień}` – w treści wysyłana
 * jest oferta SDP, w odpowiedzi serwer zwraca odpowiedź SDP.
 * UWAGA: implementacja nie była jeszcze weryfikowana na rzeczywistym serwerze go2rtc.
 */
import { normalizeUrl } from '@/stores/settingsStore';

export interface Go2rtcConfig {
  /** Adres go2rtc; pusty = `<adres Core>/go2rtc`. */
  go2rtcUrl: string;
  serverUrl: string;
}

export function resolveGo2rtcBaseUrl(config: Go2rtcConfig): string {
  const explicit = normalizeUrl(config.go2rtcUrl);
  if (explicit) return explicit;
  return `${normalizeUrl(config.serverUrl)}/go2rtc`;
}

export interface StreamSession {
  stream: MediaStream;
  close: () => void;
}

export interface StreamHandlers {
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

const ICE_GATHERING_TIMEOUT_MS = 2000;

function waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ICE_GATHERING_TIMEOUT_MS);
    function done() {
      clearTimeout(timer);
      connection.removeEventListener('icegatheringstatechange', check);
      resolve();
    }
    function check() {
      if (connection.iceGatheringState === 'complete') done();
    }
    connection.addEventListener('icegatheringstatechange', check);
  });
}

/** Zestawia sesję WebRTC (tylko odbiór) dla wskazanego strumienia go2rtc. */
export async function openGo2rtcStream(
  baseUrl: string,
  streamName: string,
  handlers: StreamHandlers = {},
  signal?: AbortSignal,
): Promise<StreamSession> {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('Przeglądarka nie obsługuje WebRTC.');
  }

  // Sieć lokalna – bez zewnętrznych serwerów STUN/TURN.
  const connection = new RTCPeerConnection({ iceServers: [] });
  const stream = new MediaStream();
  const close = () => connection.close();

  try {
    connection.addTransceiver('video', { direction: 'recvonly' });
    connection.addTransceiver('audio', { direction: 'recvonly' });
    connection.addEventListener('track', (event) => stream.addTrack(event.track));
    connection.addEventListener('connectionstatechange', () =>
      handlers.onConnectionStateChange?.(connection.connectionState),
    );

    await connection.setLocalDescription(await connection.createOffer());
    await waitForIceGathering(connection);

    const response = await fetch(`${baseUrl}/api/webrtc?src=${encodeURIComponent(streamName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: connection.localDescription?.sdp ?? '',
      signal,
    });
    if (!response.ok) throw new Error(`go2rtc zwrócił błąd ${response.status}.`);

    await connection.setRemoteDescription({ type: 'answer', sdp: await response.text() });
    return { stream, close };
  } catch (error) {
    close();
    throw error;
  }
}
