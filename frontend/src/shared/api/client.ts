import type { Session } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The access token lives only in this module's memory: it never touches localStorage or
 * sessionStorage, so an XSS payload cannot read it from storage. The refresh token is an
 * HttpOnly cookie that JavaScript cannot see at all.
 */
let accessToken: string | null = null;
let onAuthFailure: (() => void) | null = null;
let refreshInFlight: Promise<Session | null> | null = null;

export const authSession = {
  getAccessToken: () => accessToken,
  setAccessToken: (token: string | null) => {
    accessToken = token;
  },
  setOnAuthFailure: (callback: (() => void) | null) => {
    onAuthFailure = callback;
  },
};

type Query = Record<string, string | number | boolean | undefined | null>;
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
  /** Set false for public calls (login, register): no bearer header, and no refresh attempt on 401. */
  auth?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the server. Check your connection and try again.',
    );
  }
}

async function toError(response: Response): Promise<ApiError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string; details?: unknown; requestId?: string };
  } | null;
  const e = payload?.error;
  return new ApiError(
    response.status,
    e?.code ?? 'UNKNOWN_ERROR',
    e?.message ?? `Request failed (${response.status}).`,
    e?.details ?? null,
    e?.requestId,
  );
}

/**
 * Exchanges the refresh cookie for a new access token. All concurrent callers share one request:
 * refresh tokens rotate on use, so two parallel refreshes would look like token theft.
 */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await send('/api/auth/refresh', { method: 'POST', auth: false });
      if (!response.ok) {
        accessToken = null;
        return null;
      }
      const session = (await response.json()) as Session;
      accessToken = session.accessToken;
      return session;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let response = await send(path, options);

  if (response.status === 401 && options.auth !== false) {
    if (await refreshSession()) {
      response = await send(path, options);
    } else {
      accessToken = null;
      onAuthFailure?.();
    }
  }

  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
