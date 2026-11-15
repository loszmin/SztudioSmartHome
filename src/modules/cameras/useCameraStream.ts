import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '@/services/api/httpClient';
import { openGo2rtcStream, resolveGo2rtcBaseUrl, type StreamSession } from '@/services/go2rtc/webrtc';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Camera } from '@/types/api';

/**
 * `demo` – brak backendu, obraz nie jest symulowany;
 * `offline` – kamera niedostępna wg Sztudio Core;
 * `connecting` / `live` / `error` – stan sesji WebRTC z go2rtc.
 */
export type StreamState = 'demo' | 'offline' | 'connecting' | 'live' | 'error';

export function useCameraStream(camera: Camera) {
  const mode = useSettingsStore((state) => state.mode);
  const serverUrl = useSettingsStore((state) => state.serverUrl);
  const go2rtcUrl = useSettingsStore((state) => state.go2rtcUrl);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const active = mode === 'live' && camera.status === 'online';
  const baseUrl = resolveGo2rtcBaseUrl({ go2rtcUrl, serverUrl });

  useEffect(() => {
    if (!active) return;
    const abort = new AbortController();
    const video = videoRef.current;
    let session: StreamSession | null = null;
    let cancelled = false;

    setPhase('connecting');
    setError(null);

    openGo2rtcStream(
      baseUrl,
      camera.streamName,
      {
        onConnectionStateChange: (state) => {
          if (cancelled) return;
          if (state === 'connected') setPhase('live');
          if (state === 'failed' || state === 'disconnected') {
            setPhase('error');
            setError('Połączenie ze strumieniem zostało przerwane.');
          }
        },
      },
      abort.signal,
    )
      .then((opened) => {
        if (cancelled) {
          opened.close();
          return;
        }
        session = opened;
        if (video) video.srcObject = opened.stream;
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setPhase('error');
        setError(describeError(cause));
      });

    return () => {
      cancelled = true;
      abort.abort();
      session?.close();
      if (video) video.srcObject = null;
    };
  }, [active, baseUrl, camera.streamName, attempt]);

  const reconnect = useCallback(() => setAttempt((value) => value + 1), []);

  const state: StreamState = camera.status === 'offline' ? 'offline' : mode === 'demo' ? 'demo' : phase;
  return { state, error, videoRef, reconnect, active };
}

/** Zapisuje bieżącą klatkę wideo jako plik PNG. Zwraca false, gdy brak obrazu. */
export function saveSnapshot(video: HTMLVideoElement | null, cameraName: string): boolean {
  if (!video || video.videoWidth === 0) return false;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) return false;
  context.drawImage(video, 0, 0);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.download = `${cameraName.replace(/\s+/g, '_')}_${stamp}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  return true;
}
