import { describe, expect, it } from 'vitest';
import { EMPTY_CAMERA_FORM, toCameraInput, toTestInput, validateCameraForm } from './cameraForm';

const filled = { ...EMPTY_CAMERA_FORM, name: 'Wejście', host: '192.168.1.64', rtspPath: '/stream1', username: 'admin', password: 'tajne' };

describe('formularz kamery', () => {
  it('waliduje wymagane pola', () => {
    expect(validateCameraForm(EMPTY_CAMERA_FORM, false)).toMatch(/nazwę/);
    expect(validateCameraForm({ ...filled, host: '' }, false)).toMatch(/adres IP/);
    expect(validateCameraForm({ ...filled, host: '' }, true)).toBeNull(); // kamera dziedziczy adres rejestratora
    expect(validateCameraForm({ ...filled, rtspPath: '' }, false)).toMatch(/ścieżkę/);
    expect(validateCameraForm({ ...filled, rtspPort: '70000' }, false)).toMatch(/1–65535/);
    expect(validateCameraForm({ ...filled, entry: 'url', rtspUrl: 'http://x' }, false)).toMatch(/rtsp:\/\//);
    expect(validateCameraForm(filled, false)).toBeNull();
  });

  it('przy edycji puste hasło oznacza „bez zmian”, a przy dodawaniu jest wysyłane', () => {
    const blank = { ...filled, password: '' };
    expect('password' in toCameraInput(blank, true)).toBe(false);
    expect(toCameraInput(blank, false).password).toBe('');
    expect(toCameraInput(filled, true).password).toBe('tajne');
    expect(toTestInput(blank, 'cam-1')).toMatchObject({ cameraId: 'cam-1', host: '192.168.1.64', rtspPort: 554 });
    expect('password' in toTestInput(blank, 'cam-1')).toBe(false);
  });

  it('pełny adres RTSP jest wysyłany bez rozkładania w przeglądarce', () => {
    const input = toCameraInput({ ...filled, entry: 'url', rtspUrl: ' rtsp://a:b@192.168.1.64/s ' }, false);
    expect(input.rtspUrl).toBe('rtsp://a:b@192.168.1.64/s');
    expect(input.host).toBeUndefined();
  });

  it('czyści pola opcjonalne wartością null', () => {
    const input = toCameraInput({ ...filled, fps: '', resolution: '', username: '' }, true);
    expect(input).toMatchObject({ fps: null, resolution: null, username: null, onvifPort: null });
  });
});
