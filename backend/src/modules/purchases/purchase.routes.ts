import { Router, type RequestHandler } from 'express';
import { requireRole } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../vehicles/vehicle.schemas.js';
import type { createPurchaseController } from './purchase.controller.js';
import { listPurchasesQuery, purchaseBody, restockBody } from './purchase.schemas.js';

interface Deps {
  controller: ReturnType<typeof createPurchaseController>;
  authenticate: RequestHandler;
}

export function createInventoryRoutes({ controller, authenticate }: Deps): Router {
  const router = Router();
  router.post(
    '/:id/purchase',
    authenticate,
    validate({ params: idParams, body: purchaseBody }),
    controller.purchase,
  );
  router.post(
    '/:id/restock',
    authenticate,
    requireRole('ADMIN'),
    validate({ params: idParams, body: restockBody }),
    controller.restock,
  );
  return router;
}

export function createPurchaseHistoryRoutes({ controller, authenticate }: Deps): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/mine', validate({ query: listPurchasesQuery }), controller.listMine); // own records only
  router.get(
    '/',
    requireRole('ADMIN'),
    validate({ query: listPurchasesQuery }),
    controller.listAll,
  );
  return router;
}
