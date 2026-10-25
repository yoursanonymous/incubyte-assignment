import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFetch } from '../../test/fetchMock';
import { ApiError, apiFetch, authSession, refreshSession } from './client';

const user = {
  id: 'u1',
  email: 'a@example.com',
  role: 'CUSTOMER',
  createdAt: '2026-01-01T00:00:00Z',
};
const session = (token: string) => ({
  status: 200,
  body: { user, accessToken: token, expiresIn: 900 },
});
const unauthorized = {
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'expired', requestId: 'r' } },
};

beforeEach(() => {
  authSession.setAccessToken(null);
  authSession.setOnAuthFailure(null);
});

describe('apiFetch', () => {
  it('sends the in-memory bearer token, JSON body and credentials', async () => {
    const http = mockFetch({ 'POST /api/things': { status: 201, body: { ok: true } } });
    authSession.setAccessToken('tok-1');
    await apiFetch('/api/things', { method: 'POST', body: { a: 1 } });
    expect(http.calls[0]).toMatchObject({
      method: 'POST',
      headers: { authorization: 'Bearer tok-1', 'content-type': 'application/json' },
      body: { a: 1 },
      credentials: 'include',
    });
  });

  it('never persists tokens in web storage', async () => {
    mockFetch({ 'POST /api/auth/refresh': session('secret-token') });
    await refreshSession();
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret-token');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('secret-token');
  });

  it('turns the error envelope into an ApiError', async () => {
    mockFetch({
      'GET /api/x': {
        status: 409,
        body: {
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: 'Only 1 unit(s) available.',
            details: { available: 1 },
            requestId: 'req-9',
          },
        },
      },
    });
    await expect(apiFetch('/api/x')).rejects.toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      details: { available: 1 },
      requestId: 'req-9',
    });
  });

  it('maps network failures to a friendly ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await apiFetch('/api/x').catch((e) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('omits empty query parameters and encodes the rest', async () => {
    const http = mockFetch({ 'GET /api/v': { body: {} } });
    await apiFetch('/api/v', { query: { make: 'a b', model: '', category: undefined, page: 2 } });
    expect(http.calls[0]!.url).toBe('/api/v?make=a+b&page=2');
  });

  it('returns undefined for 204 responses', async () => {
    mockFetch({ 'DELETE /api/v/1': { status: 204 } });
    await expect(apiFetch('/api/v/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});

describe('automatic session refresh', () => {
  it('refreshes once on 401 and retries the original request with the new token', async () => {
    let first = true;
    const http = mockFetch({
      'GET /api/data': (call) =>
        call.headers.authorization === 'Bearer new-token' ? { body: { v: 1 } } : unauthorized,
      'POST /api/auth/refresh': () => {
        first = false;
        return session('new-token');
      },
    });
    authSession.setAccessToken('old-token');
    await expect(apiFetch('/api/data')).resolves.toEqual({ v: 1 });
    expect(first).toBe(false);
    expect(http.count('GET /api/data')).toBe(2);
    expect(authSession.getAccessToken()).toBe('new-token');
  });

  it('shares ONE refresh between simultaneous 401s (single-flight)', async () => {
    const http = mockFetch({
      'GET /api/a': (c) =>
        c.headers.authorization === 'Bearer fresh' ? { body: 'a' } : unauthorized,
      'GET /api/b': (c) =>
        c.headers.authorization === 'Bearer fresh' ? { body: 'b' } : unauthorized,
      'GET /api/c': (c) =>
        c.headers.authorization === 'Bearer fresh' ? { body: 'c' } : unauthorized,
      'POST /api/auth/refresh': async () => {
        await new Promise((r) => setTimeout(r, 20));
        return session('fresh');
      },
    });
    authSession.setAccessToken('stale');
    const results = await Promise.all([apiFetch('/api/a'), apiFetch('/api/b'), apiFetch('/api/c')]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(http.count('POST /api/auth/refresh')).toBe(1); // otherwise rotation would flag a replay
  });

  it('signs the user out when the refresh itself fails', async () => {
    const onFailure = vi.fn();
    authSession.setOnAuthFailure(onFailure);
    mockFetch({
      'GET /api/data': unauthorized,
      'POST /api/auth/refresh': {
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'x', requestId: 'r' } },
      },
    });
    authSession.setAccessToken('stale');
    await expect(apiFetch('/api/data')).rejects.toMatchObject({ status: 401 });
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(authSession.getAccessToken()).toBeNull();
  });

  it('does not loop: a 401 after a successful refresh is surfaced', async () => {
    const http = mockFetch({
      'GET /api/data': unauthorized,
      'POST /api/auth/refresh': session('t2'),
    });
    authSession.setAccessToken('t1');
    await expect(apiFetch('/api/data')).rejects.toMatchObject({ status: 401 });
    expect(http.count('POST /api/auth/refresh')).toBe(1);
    expect(http.count('GET /api/data')).toBe(2);
  });

  it('does not try to refresh for unauthenticated calls such as a wrong-password login', async () => {
    const http = mockFetch({
      'POST /api/auth/login': {
        status: 401,
        body: {
          error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password.', requestId: 'r' },
        },
      },
    });
    await expect(
      apiFetch('/api/auth/login', { method: 'POST', body: {}, auth: false }),
    ).rejects.toMatchObject({ message: 'Invalid email or password.' });
    expect(http.count('POST /api/auth/refresh')).toBe(0);
  });

  it('refreshSession returns null (not an error) when there is no valid cookie', async () => {
    mockFetch({
      'POST /api/auth/refresh': {
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'x', requestId: 'r' } },
      },
    });
    await expect(refreshSession()).resolves.toBeNull();
  });
});
