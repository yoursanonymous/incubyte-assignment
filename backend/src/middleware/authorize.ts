import type { RequestHandler } from 'express';
import { Errors } from '../domain/errors.js';
import type { RoleName } from '../domain/roles.js';

/** Deny-by-default role gate. Must run after `authenticate`. */
export function requireRole(...allowed: RoleName[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw Errors.unauthenticated();
    if (!allowed.includes(req.auth.role)) throw Errors.forbidden();
    next();
  };
}
