import { Router, type RequestHandler } from 'express';
import { validate } from '../../middleware/validate.js';
import type { createAuthLimiters } from '../../middleware/rateLimit.js';
import type { createAuthController } from './auth.controller.js';
import { loginBody, registerBody } from './auth.schemas.js';

interface Deps {
  controller: ReturnType<typeof createAuthController>;
  limiters: ReturnType<typeof createAuthLimiters>;
  authenticate: RequestHandler;
  originGuard: RequestHandler;
}

export function createAuthRoutes({
  controller,
  limiters,
  authenticate,
  originGuard,
}: Deps): Router {
  const router = Router();
  router.post(
    '/register',
    limiters.register,
    validate({ body: registerBody }),
    controller.register,
  );
  router.post('/login', limiters.login, validate({ body: loginBody }), controller.login);
  // Cookie-authenticated endpoints get the origin guard (CSRF defence).
  router.post('/refresh', originGuard, limiters.refresh, controller.refresh);
  router.post('/logout', originGuard, controller.logout);
  router.get('/me', authenticate, controller.me);
  return router;
}
