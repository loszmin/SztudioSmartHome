import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataSource } from '@/hooks/useCoreQuery';
import { describeError } from '@/services/api/httpClient';
import { getCoreApi } from '@/services/coreApiProvider';
import { openCameraStream, type StreamSession } from '@/services/go2rtc/webrtc';
import type { Camera } from '@/types/api';

/**
 * `demo` – brak backendu, obraz nie jest symulowany;
 * `offline` – kamera niedostępna wg Sztudio Core;
 * `disabled` / `unconfigured` – kamera wyłączona lub bez źródła obrazu;
 * `connecting` / `live` / `error` – stan sesji WebRTC.
 */
export type StreamState = 'demo' | 'offline' | 'disabled' | 'unconfigured' | 'connecting' | 'live' | 'error';

/** Odstępy automatycznego wznawiania połączenia (kolejne próby coraz rzadziej). */
export const RECONNECT_DELAYS_MS = [2000, 5000, 10_000, 20_000, 30_000];

export function reconnectDelay(failures: number): number {
  return RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length) - 1] ?? RECONNECT_DELAYS_MS[0]!;
}

export function useCameraStream(camera: Camera) {
  const source = useDataSource();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const failures = useRef(0);

  const { mode, serverUrl, apiToken } = source;
  const configured = camera.streamState === undefined || camera.streamState === 'registered' || camera.streamState === 'error';
  const active = mode === 'live' && camera.status === 'online' && camera.enabled !== false && configured;

  useEffect(() => {
    if (!active) {
      failures.current = 0;
      return;
    }
    const abort = new AbortController();
    const video = videoRef.current;
    let session: StreamSession | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const fail = (message: string) => {
      if (cancelled) return;
      session?.close();
      session = null;
      failures.current += 1;
      setPhase('error');
      setError(message);
      // Automatyczne wznawianie: kamera lub go2rtc mogły chwilowo zniknąć.
      retryTimer = setTimeout(() => setAttempt((value) => value + 1), reconnectDelay(failures.current));
    };

    setPhase('connecting');
    setError(null);

    openCameraStream(
      getCoreApi({ mode, serverUrl, apiToken }),
      camera.id,
      {
        onConnectionStateChange: (state) => {
          if (cancelled) return;
          if (state === 'connected') {
            failures.current = 0;
            setPhase('live');
          }
          if (state === 'failed' || state === 'disconnected') fail('Połączenie ze strumieniem zostało przerwane.');
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
      .catch((cause: unknown) => fail(describeError(cause)));

    return () => {
      cancelled = true;
      abort.abort();
      if (retryTimer) clearTimeout(retryTimer);
      session?.close();
      if (video) video.srcObject = null;
    };
  }, [active, mode, serverUrl, apiToken, camera.id, attempt]);

  const reconnect = useCallback(() => {
    failures.current = 0;
    setAttempt((value) => value + 1);
  }, []);

  let state: StreamState;
  if (camera.enabled === false) state = 'disabled';
  else if (mode === 'live' && camera.streamState === 'not_configured') state = 'unconfigured';
  else if (camera.status === 'offline') state = 'offline';
  else if (mode === 'demo') state = 'demo';
  else state = phase;

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
