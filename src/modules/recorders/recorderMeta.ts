import type { Tone } from '@/components/tone';
import type { ProtocolCheck, ProtocolState, RecorderSeries } from '@/types/api';

export const SERIES_LABELS: Record<RecorderSeries, string> = {
  bcs_point: 'BCS Point',
  bcs_line: 'BCS Line',
  other: 'Inny / nieznany',
};

export const PROTOCOL_LABELS: Record<ProtocolCheck['protocol'], string> = { http: 'HTTP', rtsp: 'RTSP', onvif: 'ONVIF' };

export const PROTOCOL_STATES: Record<ProtocolState, { tone: Tone; label: string }> = {
  ok: { tone: 'success', label: 'odpowiada' },
  auth_failed: { tone: 'warning', label: 'odrzucone logowanie' },
  closed: { tone: 'danger', label: 'port zamknięty' },
  timeout: { tone: 'danger', label: 'brak odpowiedzi' },
  error: { tone: 'danger', label: 'błąd' },
  skipped: { tone: 'neutral', label: 'pominięto' },
};
