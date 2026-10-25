import type { RequestHandler } from 'express';
import { Errors } from '../domain/errors.js';
import type { TokenService } from '../modules/auth/tokens.js';
import type { UserRepository } from '../modules/auth/user.repository.js';

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i;

/**
 * Requires a valid access token, then loads the user so that role changes and account
 * disabling take effect immediately instead of when the token expires.
 */
export function createAuthenticate(tokens: TokenService, users: UserRepository): RequestHandler {
  return async (req, _res, next) => {
    const match = BEARER.exec(req.headers.authorization ?? '');
    if (!match) throw Errors.unauthenticated();

    const claims = await tokens.verifyAccessToken(match[1]!);
    const user = await users.findById(claims.userId);
    if (!user || user.status !== 'ACTIVE')
      throw Errors.unauthenticated('Invalid or expired access token.');

    req.auth = { userId: user.id, role: user.role }; // role from the database, not the token
    next();
  };
}
