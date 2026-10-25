export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EMAIL_TAKEN'
  | 'INSUFFICIENT_STOCK'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

/** An error whose message is safe to show to API clients. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (details: unknown, message = 'The request is invalid.') =>
    new AppError(400, 'VALIDATION_ERROR', message, details),
  unauthenticated: (message = 'Authentication is required.') =>
    new AppError(401, 'UNAUTHENTICATED', message),
  forbidden: (message = 'You do not have permission to perform this action.') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`),
  conflict: (message = 'The resource was modified by someone else. Reload and try again.') =>
    new AppError(409, 'CONFLICT', message),
  emailTaken: () => new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.'),
  insufficientStock: (available: number) =>
    new AppError(409, 'INSUFFICIENT_STOCK', `Only ${available} unit(s) available.`, { available }),
  idempotencyKeyReused: () =>
    new AppError(
      422,
      'IDEMPOTENCY_KEY_REUSED',
      'This Idempotency-Key was already used with a different request.',
    ),
  rateLimited: () =>
    new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'),
  serviceUnavailable: () =>
    new AppError(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.'),
};
