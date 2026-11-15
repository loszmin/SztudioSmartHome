import type { CameraConfig, CameraInput, CameraSource, CameraTestInput } from '@/types/api';

/** Stan formularza kamery – wszystkie pola tekstowe, konwersja następuje przy zapisie. */
export interface CameraFormState {
  name: string;
  location: string;
  source: CameraSource;
  /** `fields` – adres rozłożony na pola; `url` – pełny adres rtsp:// wklejony przez użytkownika. */
  entry: 'fields' | 'url';
  host: string;
  rtspPort: string;
  rtspPath: string;
  rtspUrl: string;
  username: string;
  password: string;
  onvifPort: string;
  streamProfile: string;
  resolution: string;
  fps: string;
  vendor: string;
  model: string;
  enabled: boolean;
}

export const EMPTY_CAMERA_FORM: CameraFormState = {
  name: '',
  location: '',
  source: 'rtsp',
  entry: 'fields',
  host: '',
  rtspPort: '554',
  rtspPath: '',
  rtspUrl: '',
  username: '',
  password: '',
  onvifPort: '80',
  streamProfile: 'main',
  resolution: '',
  fps: '',
  vendor: '',
  model: '',
  enabled: true,
};

export function formFromConfig(config: CameraConfig): CameraFormState {
  return {
    ...EMPTY_CAMERA_FORM,
    name: config.name,
    location: config.location,
    source: config.source,
    host: config.host ?? '',
    rtspPort: String(config.rtspPort ?? 554),
    rtspPath: config.rtspPath ?? '',
    username: config.username ?? '',
    onvifPort: String(config.onvifPort ?? 80),
    streamProfile: config.streamProfile ?? '',
    resolution: config.resolution ?? '',
    fps: config.fps ? String(config.fps) : '',
    vendor: config.vendor,
    model: config.model,
    enabled: config.enabled !== false,
  };
}

const port = (value: string): number | null => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Parametry połączenia wspólne dla testu i zapisu. Puste hasło przy edycji = „bez zmian”. */
function connectionOf(form: CameraFormState, editing: boolean): CameraInput {
  const input: CameraInput = {};
  if (form.entry === 'url') {
    input.rtspUrl = form.rtspUrl.trim();
  } else {
    input.host = form.host.trim() || null;
    input.rtspPort = port(form.rtspPort);
    input.rtspPath = form.rtspPath.trim() || null;
    input.username = form.username.trim() || null;
    if (form.password !== '' || !editing) input.password = form.password;
  }
  return input;
}

export function toTestInput(form: CameraFormState, cameraId?: string): CameraTestInput {
  return { ...connectionOf(form, cameraId !== undefined), cameraId };
}

export function toCameraInput(form: CameraFormState, editing: boolean): CameraInput {
  return {
    ...connectionOf(form, editing),
    name: form.name.trim(),
    location: form.location.trim(),
    source: form.source,
    onvifPort: form.source === 'onvif' ? port(form.onvifPort) : null,
    streamProfile: form.streamProfile.trim() || null,
    resolution: form.resolution.trim() || null,
    fps: port(form.fps),
    vendor: form.vendor.trim(),
    model: form.model.trim(),
    enabled: form.enabled,
  };
}

/** Zwraca komunikat o brakujących danych albo null, gdy formularz można zapisać. */
export function validateCameraForm(form: CameraFormState, inheritsFromRecorder: boolean): string | null {
  if (!form.name.trim()) return 'Podaj nazwę kamery.';
  if (form.entry === 'url') {
    return form.rtspUrl.trim().toLowerCase().startsWith('rtsp://') ? null : 'Adres musi zaczynać się od rtsp://.';
  }
  if (!form.host.trim() && !inheritsFromRecorder) return 'Podaj adres IP kamery.';
  if (!form.rtspPath.trim()) return 'Podaj ścieżkę strumienia RTSP albo wczytaj profile ONVIF.';
  const rtspPort = port(form.rtspPort);
  if (rtspPort === null || rtspPort < 1 || rtspPort > 65535) return 'Port RTSP musi być liczbą z zakresu 1–65535.';
  return null;
}
