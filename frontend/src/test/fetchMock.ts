import { vi } from 'vitest';

export interface MockCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  credentials?: RequestCredentials;
}
type Handler = (
  call: MockCall,
) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;

/** Replaces global fetch with a router keyed by "METHOD /path" (query string ignored in the key). */
export function mockFetch(routes: Record<string, Handler | { status?: number; body?: unknown }>) {
  const calls: MockCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [
        k.toLowerCase(),
        v,
      ]),
    );
    const call: MockCall = {
      url,
      method,
      headers,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      credentials: init.credentials,
    };
    calls.push(call);
    const route = routes[`${method} ${url.split('?')[0]}`];
    if (!route)
      return new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: `unmocked ${method} ${url}` } }),
        { status: 404 },
      );
    const result = typeof route === 'function' ? await route(call) : route;
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return {
    calls,
    fn,
    count: (key: string) =>
      calls.filter((c) => `${c.method} ${c.url.split('?')[0]}` === key).length,
  };
}
