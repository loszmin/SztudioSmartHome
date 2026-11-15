/**
 * Podgląd kamery przez WebRTC.
 *
 * Panel nigdy nie łączy się z go2rtc ani nie zna adresu RTSP kamery. Ofertę SDP wysyła do
 * Sztudio Core (autoryzowany punkt `POST /api/v1/cameras/{id}/webrtc`), a Core wymienia ją
 * z go2rtc w sieci wewnętrznej. Obraz płynie potem szyfrowanym połączeniem WebRTC.
 */
import type { SztudioCoreApi } from '@/services/api/coreApi';

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

/** Zestawia sesję WebRTC (tylko odbiór) dla wskazanej kamery. */
export async function openCameraStream(
  api: Pick<SztudioCoreApi, 'webrtcOffer'>,
  cameraId: string,
  handlers: StreamHandlers = {},
  signal?: AbortSignal,
): Promise<StreamSession> {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('Przeglądarka nie obsługuje WebRTC.');
  }

  // Sieć lokalna – bez zewnętrznych serwerów STUN/TURN; system działa bez internetu.
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

    const answer = await api.webrtcOffer(cameraId, connection.localDescription?.sdp ?? '', signal);
    await connection.setRemoteDescription({ type: 'answer', sdp: answer });
    return { stream, close };
  } catch (error) {
    close();
    throw error;
  }
}
