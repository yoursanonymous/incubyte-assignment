import type { RequestHandler } from 'express';
import { Errors } from '../domain/errors.js';

/**
 * CSRF defence for cookie-authenticated endpoints (refresh, logout), layered on SameSite=Strict:
 * a browser-supplied Origin must be on the allowlist, and cross-site fetches are refused.
 * Non-browser clients send neither header and are unaffected.
 */
export function createOriginGuard(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins.includes(origin))
      throw Errors.forbidden('Origin not allowed.');
    if (req.headers['sec-fetch-site'] === 'cross-site')
      throw Errors.forbidden('Cross-site requests are not allowed.');
    next();
  };
}
