import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Errors } from '../domain/errors.js';
import type { Env } from '../config/env.js';

type Limits = Pick<Env, 'AUTH_RATE_LIMIT_MAX' | 'AUTH_RATE_LIMIT_WINDOW_MS'>;

function limiter(max: number, windowMs: number, skipSuccessfulRequests = false): RequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler: (_req, _res, next) => next(Errors.rateLimited()),
  });
}

/**
 * Abuse limits for authentication endpoints, keyed by client IP.
 * NOTE: the default store is per-process; with N instances the effective limit is N times higher
 * (documented residual risk in docs/security.md).
 */
export function createAuthLimiters({
  AUTH_RATE_LIMIT_MAX: max,
  AUTH_RATE_LIMIT_WINDOW_MS: windowMs,
}: Limits) {
  return {
    register: limiter(max, windowMs),
    // Only failed logins count, so legitimate users are not locked out by their own successes.
    login: limiter(max, windowMs, true),
    refresh: limiter(max * 6, windowMs),
  };
}
