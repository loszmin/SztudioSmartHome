export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'parse';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  /** Kod diagnostyczny zwrócony przez Core (np. `auth_failed`, `address_not_allowed`). */
  readonly code?: string;

  constructor(kind: ApiErrorKind, message: string, status?: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export interface HttpClientConfig {
  /** Adres bazowy bez końcowego ukośnika; pusty = ten sam origin. */
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Treść wysyłana bez kodowania JSON (np. oferta SDP) wraz z typem zawartości. */
  rawBody?: { content: string; contentType: string };
  /** Oczekiwany format odpowiedzi; domyślnie JSON. */
  expect?: 'json' | 'text';
  /** Limit czasu tego żądania (np. dłuższy dla operacji na urządzeniach). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Wyciąga opis i kod błędu z odpowiedzi Core (`{detail: "…"}` lub `{detail: {code, message}}`). */
async function readErrorDetail(response: Response): Promise<{ message?: string; code?: string }> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    const detail = payload?.detail;
    if (typeof detail === 'string') return { message: detail };
    if (Array.isArray(detail)) {
      const first = detail[0] as { msg?: string; loc?: unknown[] } | undefined;
      const field = Array.isArray(first?.loc) ? String(first.loc[first.loc.length - 1]) : '';
      return { message: first?.msg ? `Nieprawidłowe dane${field ? ` (${field})` : ''}: ${first.msg}` : undefined };
    }
    if (detail && typeof detail === 'object') {
      const { message, code } = detail as { message?: string; code?: string };
      return { message, code };
    }
  } catch {
    // Odpowiedź bez treści JSON – zostaje komunikat ogólny.
  }
  return {};
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
    }, options.timeoutMs ?? timeoutMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);

    try {
      const headers: Record<string, string> = { Accept: options.expect === 'text' ? '*/*' : 'application/json' };
      if (options.rawBody) headers['Content-Type'] = options.rawBody.contentType;
      else if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      if (config.token) headers.Authorization = `Bearer ${config.token}`;

      let response: Response;
      try {
        response = await fetch(buildUrl(config.baseUrl, path, options.query), {
          method: options.method ?? 'GET',
          headers,
          body: options.rawBody?.content ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
          signal: controller.signal,
          cache: 'no-store',
        });
      } catch (error) {
        if (timedOut) throw new ApiError('timeout', 'Serwer nie odpowiedział w wyznaczonym czasie.');
        if (options.signal?.aborted) throw error;
        throw new ApiError('network', 'Serwer jest nieosiągalny. Sprawdź, czy Sztudio Core działa i jest dostępny w sieci lokalnej.');
      }

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        const message =
          response.status === 401
            ? 'Serwer wymaga uwierzytelnienia – zaloguj się w Ustawieniach lub sprawdź token API.'
            : response.status === 403
              ? (detail.message ?? 'Brak uprawnień do tej operacji.')
              : (detail.message ?? `Serwer zwrócił błąd ${response.status}.`);
        throw new ApiError('http', message, response.status, detail.code);
      }
      if (response.status === 204) return undefined as T;
      if (options.expect === 'text') return (await response.text()) as T;

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
