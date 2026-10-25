const RETRYABLE_CODES = new Set([
  'P2034', // Prisma: transaction failed due to a write conflict or a deadlock
  '40001', // PostgreSQL: serialization_failure
  '40P01', // PostgreSQL: deadlock_detected
]);

/** True only for transient concurrency failures. Business errors and constraint violations are final. */
export function isRetryableTxError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && RETRYABLE_CODES.has(candidate.code)) return true;
    current = candidate.cause;
  }
  return false;
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Re-runs `operation` after transient transaction failures with exponential backoff and jitter.
 * Only wrap operations that are atomic (a rolled-back attempt leaves no trace) — every attempt
 * starts from scratch, so retrying cannot double-apply a change.
 */
export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 20,
    sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  } = options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isRetryableTxError(error)) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1) * (1 + Math.random() * 0.1));
    }
  }
}
