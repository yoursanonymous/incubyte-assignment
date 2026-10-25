import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { getValidated } from '../../middleware/validate.js';
import type { LoginBody, RegisterBody } from './auth.schemas.js';
import { toPublicUser, type AuthService, type Session } from './auth.service.js';
import type { UserRepository } from './user.repository.js';
import { Errors } from '../../domain/errors.js';

export const REFRESH_COOKIE = 'refresh_token';

export function createAuthController(
  service: AuthService,
  users: UserRepository,
  secureCookies: boolean,
) {
  const baseCookie: CookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: secureCookies,
    path: '/api/auth', // the browser sends the cookie only to auth endpoints
  };

  const sendSession = (res: Response, status: number, session: Session): void => {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...baseCookie,
      expires: session.refreshExpiresAt,
    });
    res
      .status(status)
      .json({ user: session.user, accessToken: session.accessToken, expiresIn: session.expiresIn });
  };

  const cookieToken = (req: Request): string | undefined => {
    const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };

  const register: RequestHandler = async (_req, res) => {
    const { body } = getValidated<unknown, unknown, RegisterBody>(res);
    sendSession(res, 201, await service.register(body));
  };

  const login: RequestHandler = async (_req, res) => {
    const { body } = getValidated<unknown, unknown, LoginBody>(res);
    sendSession(res, 200, await service.login(body));
  };

  const refresh: RequestHandler = async (req, res) => {
    sendSession(res, 200, await service.refresh(cookieToken(req)));
  };

  const logout: RequestHandler = async (req, res) => {
    await service.logout(cookieToken(req));
    res.clearCookie(REFRESH_COOKIE, baseCookie);
    res.status(204).end();
  };

  const me: RequestHandler = async (req, res) => {
    const user = req.auth ? await users.findById(req.auth.userId) : null;
    if (!user) throw Errors.unauthenticated();
    res.json({ user: toPublicUser(user) });
  };

  return { register, login, refresh, logout, me };
}
