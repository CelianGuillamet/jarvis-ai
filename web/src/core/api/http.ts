export type HttpMethod = 'GET' | 'POST';

export type HttpClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  getAuthToken?: () => string | null;
};

export type HttpRequestOptions = {
  method: HttpMethod;
  path: string;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class HttpError extends Error {
  readonly name = 'HttpError';
  readonly status: number;
  readonly payload: unknown;

  constructor(input: { message: string; status: number; payload?: unknown }) {
    super(input.message);
    this.status = input.status;
    this.payload = input.payload;
  }
}

export class TimeoutError extends Error {
  readonly name = 'TimeoutError';
  constructor(message = 'La requête a expiré.') {
    super(message);
  }
}

function joinUrl(base: string, path: string) {
  const b = base.trim().replace(/\/+$/g, '');
  const p = path.trim();
  if (!b) return p.startsWith('/') ? p : `/${p}`;
  if (!p) return b;
  return p.startsWith('/') ? `${b}${p}` : `${b}/${p}`;
}

function buildHeaders(init?: HeadersInit) {
  const headers = new Headers(init || {});
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  return headers;
}

function combineSignals(signals: AbortSignal[]) {
  if (signals.length === 1) return signals[0];
  const any = (AbortSignal as any).any as ((signals: AbortSignal[]) => AbortSignal) | undefined;
  if (typeof any === 'function') return any(signals);

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

async function safeJson(response: Response) {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createHttpClient(options: HttpClientOptions = {}) {
  const baseUrl = options.baseUrl?.trim() || '';
  const defaultTimeoutMs =
    typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
      ? Math.max(1_000, Math.floor(options.timeoutMs))
      : 60_000;

  const request = async <T>(input: HttpRequestOptions): Promise<T> => {
    const url = joinUrl(baseUrl, input.path);
    const headers = buildHeaders();

    const token = options.getAuthToken?.();
    if (token) headers.set('authorization', `Bearer ${token}`);

    const controller = new AbortController();
    const timeoutMs =
      typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs)
        ? Math.max(1_000, Math.floor(input.timeoutMs))
        : defaultTimeoutMs;
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    const signals: AbortSignal[] = [controller.signal];
    if (input.signal) signals.push(input.signal);

    const combined = combineSignals(signals);

    const hasBody = input.method !== 'GET' && input.body !== undefined;
    const body = hasBody ? JSON.stringify(input.body) : undefined;
    if (hasBody) headers.set('content-type', 'application/json');

    try {
      const res = await fetch(url, {
        method: input.method,
        headers,
        body: body ?? null,
        signal: combined ?? null,
      });

      const payload = await safeJson(res);
      if (!res.ok) {
        const message =
          payload && typeof payload === 'object' && 'message' in (payload as any)
            ? String((payload as any).message || `HTTP ${res.status}`)
            : typeof payload === 'string' && payload
              ? payload
              : `HTTP ${res.status}`;
        throw new HttpError({ message, status: res.status, payload });
      }

      return payload as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TimeoutError();
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  return {
    get: <T>(path: string, options?: Omit<HttpRequestOptions, 'method' | 'path'>) =>
      request<T>({ method: 'GET', path, ...options }),
    post: <T>(
      path: string,
      body?: unknown,
      options?: Omit<HttpRequestOptions, 'method' | 'path' | 'body'>,
    ) => request<T>({ method: 'POST', path, body, ...options }),
  };
}
