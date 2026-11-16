import { vi } from 'vitest';

/** Prosty serwer Core podstawiony pod `fetch`: trasy „METODA ścieżka” → odpowiedź. */
export type Handler = (body: unknown, url: URL, init: RequestInit) => { status?: number; body?: unknown; text?: string };

export const STATUS = {
  core: { state: 'online', version: '1.0.0', hostname: 'core', uptimeSeconds: 60 },
  resources: { cpuPercent: 1, memoryPercent: 2, diskPercent: 3 },
  services: [{ key: 'go2rtc', name: 'go2rtc (strumienie wideo)', state: 'running' }],
  alarmSystem: { mode: 'disarmed', changedAt: new Date().toISOString() },
  serverTime: new Date().toISOString(),
};

export function stubCore(routes: Record<string, Handler>) {
  const calls: Array<{ method: string; path: string; body: unknown; contentType?: string }> = [];
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://core.test');
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    let body: unknown = init.body;
    if (typeof init.body === 'string' && headers['Content-Type'] === 'application/json') body = JSON.parse(init.body);
    calls.push({ method, path: url.pathname, body, contentType: headers['Content-Type'] });

    const handler = routes[`${method} ${url.pathname}`];
    const defaults: Record<string, unknown> = { '/api/v1/system/status': STATUS };
    const result = handler ? handler(body, url, init) : { body: defaults[url.pathname] ?? [] };
    const status = result.status ?? 200;
    if (result.text !== undefined) return new Response(result.text, { status });
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? null), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}
