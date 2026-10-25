import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import { createAuthenticate } from './middleware/authenticate.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createOriginGuard } from './middleware/originGuard.js';
import { createAuthLimiters } from './middleware/rateLimit.js';
import { requestContext } from './middleware/requestContext.js';
import type { Db } from './infrastructure/db.js';
import { createLogger } from './infrastructure/logger.js';
import { createAuthController } from './modules/auth/auth.controller.js';
import { createAuthRoutes } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createPasswordHasher } from './modules/auth/password.js';
import { createTokenService } from './modules/auth/tokens.js';
import { createUserRepository } from './modules/auth/user.repository.js';
import { createPurchaseController } from './modules/purchases/purchase.controller.js';
import {
  createInventoryRoutes,
  createPurchaseHistoryRoutes,
} from './modules/purchases/purchase.routes.js';
import { createPurchaseService } from './modules/purchases/purchase.service.js';
import { createVehicleController } from './modules/vehicles/vehicle.controller.js';
import { createVehicleRoutes } from './modules/vehicles/vehicle.routes.js';
import { createVehicleService } from './modules/vehicles/vehicle.service.js';
import { openApiDocument } from './openapi/spec.js';
import { createHealthRoutes } from './modules/health/health.routes.js';

export interface AppDeps {
  env: Env;
  db: Db;
}

export function createApp({ env, db }: AppDeps): Express {
  const app = express();
  const logger = createLogger(env.LOG_LEVEL);

  app.disable('x-powered-by');
  if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(requestContext(logger));
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); // API responses carry per-user data and tokens
    next();
  });

  const tokens = createTokenService({
    secret: env.JWT_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
  });
  const hasher = createPasswordHasher({
    memoryKiB: env.ARGON2_MEMORY_KIB,
    timeCost: env.ARGON2_TIME_COST,
  });
  const users = createUserRepository(db);
  const authenticate = createAuthenticate(tokens, users);

  const authService = createAuthService({
    db,
    tokens,
    hasher,
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  });

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/health', createHealthRoutes(db));
  app.use(
    '/api/auth',
    createAuthRoutes({
      controller: createAuthController(authService, users, env.NODE_ENV === 'production'),
      limiters: createAuthLimiters(env),
      authenticate,
      originGuard: createOriginGuard(env.CORS_ORIGINS),
    }),
  );

  const purchaseController = createPurchaseController(createPurchaseService({ db }));
  // Inventory routes first: they authenticate per route, so they never shadow the catalogue router.
  app.use('/api/vehicles', createInventoryRoutes({ controller: purchaseController, authenticate }));
  app.use(
    '/api/purchases',
    createPurchaseHistoryRoutes({ controller: purchaseController, authenticate }),
  );
  app.use(
    '/api/vehicles',
    createVehicleRoutes({
      controller: createVehicleController(createVehicleService({ db })),
      authenticate,
    }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
