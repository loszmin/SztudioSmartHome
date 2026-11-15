export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'parse';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export interface HttpClientConfig {
  /** Adres bazowy bez końcowego ukośnika; pusty = ten sam origin. */
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 8000;

function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return `${baseUrl}${path}${search ? `?${search}` : ''}`;
}

/** Minimalny klient HTTP dla Sztudio Core: limit czasu, nagłówki, ujednolicone błędy. */
export function createHttpClient(config: HttpClientConfig) {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      if (config.token) headers.Authorization = `Bearer ${config.token}`;

      let response: Response;
      try {
        response = await fetch(buildUrl(config.baseUrl, path, options.query), {
          method: options.method ?? 'GET',
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
          cache: 'no-store',
        });
      } catch (error) {
        if (timedOut) throw new ApiError('timeout', 'Serwer nie odpowiedział w wyznaczonym czasie.');
        if (options.signal?.aborted) throw error;
        throw new ApiError('network', 'Serwer jest nieosiągalny. Sprawdź, czy Sztudio Core działa i jest dostępny w sieci lokalnej.');
      }

      if (!response.ok) {
        const message =
          response.status === 401 || response.status === 403
            ? 'Serwer odrzucił żądanie – sprawdź token API.'
            : `Serwer zwrócił błąd ${response.status}.`;
        throw new ApiError('http', message, response.status);
      }
      if (response.status === 204) return undefined as T;

      try {
        return (await response.json()) as T;
      } catch {
        throw new ApiError('parse', 'Nieprawidłowa odpowiedź serwera (oczekiwano JSON).');
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  };
}

/** Komunikat błędu do pokazania użytkownikowi. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Wystąpił nieoczekiwany błąd.';
}
