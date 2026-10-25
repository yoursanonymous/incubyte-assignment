import { Router, type RequestHandler } from 'express';
import { requireRole } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import type { createVehicleController } from './vehicle.controller.js';
import {
  createVehicleBody,
  idParams,
  listVehiclesQuery,
  updateVehicleBody,
} from './vehicle.schemas.js';

interface Deps {
  controller: ReturnType<typeof createVehicleController>;
  authenticate: RequestHandler;
}

/**
 * Policy: any authenticated user may browse; only ADMIN may change the catalogue.
 * `requireRole` runs before validation so unauthorised callers learn nothing about the schema.
 */
export function createVehicleRoutes({ controller, authenticate }: Deps): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/', validate({ query: listVehiclesQuery }), controller.list);
  router.get('/search', validate({ query: listVehiclesQuery }), controller.list); // must precede /:id
  router.get('/:id', validate({ params: idParams }), controller.get);

  const admin = requireRole('ADMIN');
  router.post('/', admin, validate({ body: createVehicleBody }), controller.create);
  router.put(
    '/:id',
    admin,
    validate({ params: idParams, body: updateVehicleBody }),
    controller.update,
  );
  router.delete('/:id', admin, validate({ params: idParams }), controller.archive);
  return router;
}
