import { describe, expect, it, vi } from 'vitest';
import { createHttpCoreApi } from './coreApi';
import { ApiError, createHttpClient } from './httpClient';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('klient HTTP Sztudio Core', () => {
  it('buduje adres z adresu bazowego, ścieżki i parametrów oraz dodaje token', async () => {
    const fetchMock = vi.fn(async () => json([]));
    vi.stubGlobal('fetch', fetchMock);

    const api = createHttpCoreApi({ baseUrl: 'http://core.test:8000', token: 'sekret' });
    await api.getEvents({ category: 'alarm', limit: 5 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://core.test:8000/api/v1/events?category=alarm&limit=5');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sekret');
  });

  it('używa ścieżek względnych, gdy adres serwera jest pusty', async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);
    await createHttpCoreApi({ baseUrl: '' }).getSystemStatus();
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/v1/system/status');
  });

  it('zgłasza błąd sieci, gdy serwer jest niedostępny', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const request = createHttpClient({ baseUrl: '' });
    await expect(request('/api/v1/cameras')).rejects.toMatchObject({ kind: 'network' });
  });

  it('zgłasza błąd HTTP ze statusem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'x' }, 503)));
    const error = await createHttpClient({ baseUrl: '' })('/api/v1/cameras').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 503 });
  });

  it('zgłasza błąd, gdy odpowiedź nie jest poprawnym JSON-em', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    await expect(createHttpClient({ baseUrl: '' })('/x')).rejects.toMatchObject({ kind: 'parse' });
  });

  it('przerywa żądanie po przekroczeniu limitu czasu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
      ),
    );
    await expect(createHttpClient({ baseUrl: '', timeoutMs: 20 })('/x')).rejects.toMatchObject({ kind: 'timeout' });
  });
});
