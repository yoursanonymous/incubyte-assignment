import { describe, expect, it, vi } from 'vitest';
import { isRetryableTxError, withTransactionRetry } from '../../src/infrastructure/retry.js';

const serializationFailure = Object.assign(new Error('write conflict'), { code: 'P2034' });
const sleep = vi.fn(async () => {});

describe('isRetryableTxError', () => {
  it.each([['P2034'], ['40001'], ['40P01']])('treats %s as retryable', (code) => {
    expect(isRetryableTxError(Object.assign(new Error('x'), { code }))).toBe(true);
  });

  it('finds the code on a nested cause', () => {
    expect(isRetryableTxError(new Error('wrapper', { cause: { code: '40P01' } }))).toBe(true);
  });

  it.each([
    [new Error('boom')],
    [Object.assign(new Error('x'), { code: 'P2002' })],
    [null],
    ['str'],
  ])('does not retry %s (business and unique-violation errors are final)', (error) => {
    expect(isRetryableTxError(error)).toBe(false);
  });
});

describe('withTransactionRetry', () => {
  it('returns immediately on success without sleeping', async () => {
    sleep.mockClear();
    await expect(withTransactionRetry(async () => 'ok', { sleep })).resolves.toBe('ok');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a transient failure and then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(serializationFailure)
      .mockRejectedValueOnce(serializationFailure)
      .mockResolvedValue('done');
    await expect(withTransactionRetry(fn, { attempts: 3, sleep })).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after the configured attempts and rethrows the last error', async () => {
    const fn = vi.fn().mockRejectedValue(serializationFailure);
    await expect(withTransactionRetry(fn, { attempts: 3, sleep })).rejects.toBe(
      serializationFailure,
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('never retries non-transient errors', async () => {
    const business = new Error('insufficient stock');
    const fn = vi.fn().mockRejectedValue(business);
    await expect(withTransactionRetry(fn, { sleep })).rejects.toBe(business);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('backs off with a growing delay', async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(serializationFailure);
    await withTransactionRetry(fn, {
      attempts: 4,
      baseDelayMs: 10,
      sleep: async (ms) => void delays.push(ms),
    }).catch(() => {});
    expect(delays).toHaveLength(3);
    expect(delays[1]!).toBeGreaterThan(delays[0]! * 0.99);
    expect(delays[2]!).toBeGreaterThan(delays[1]! * 0.99);
  });
});
