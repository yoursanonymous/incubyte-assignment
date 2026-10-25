import { Router } from 'express';
import type { Db } from '../../infrastructure/db.js';

const READINESS_TIMEOUT_MS = 2_000;

/**
 * Liveness answers "is the process up?" and touches nothing else, so an orchestrator never
 * restarts a healthy process just because the database is down.
 * Readiness answers "can this instance serve traffic?" by checking the database.
 * Neither exposes versions, hostnames or error details.
 */
export function createHealthRoutes(db: Db): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    try {
      await Promise.race([
        db.$queryRaw`SELECT 1`,
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('readiness timeout')), READINESS_TIMEOUT_MS).unref(),
        ),
      ]);
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
}
