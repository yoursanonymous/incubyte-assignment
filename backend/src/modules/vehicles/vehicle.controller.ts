import type { RequestHandler } from 'express';
import { getValidated } from '../../middleware/validate.js';
import type {
  CreateVehicleInput,
  ListVehiclesQuery,
  UpdateVehicleInput,
} from './vehicle.schemas.js';
import type { VehicleService } from './vehicle.service.js';

type Params = { id: string };

export function createVehicleController(service: VehicleService) {
  const list: RequestHandler = async (_req, res) => {
    const { query } = getValidated<unknown, ListVehiclesQuery>(res);
    res.json(await service.list(query));
  };

  const get: RequestHandler = async (_req, res) => {
    const { params } = getValidated<Params>(res);
    res.json({ data: await service.getById(params.id) });
  };

  const create: RequestHandler = async (req, res) => {
    const { body } = getValidated<unknown, unknown, CreateVehicleInput>(res);
    res.status(201).json({ data: await service.create(req.auth!.userId, body) });
  };

  const update: RequestHandler = async (req, res) => {
    const { params, body } = getValidated<Params, unknown, UpdateVehicleInput>(res);
    res.json({ data: await service.update(req.auth!.userId, params.id, body) });
  };

  const archive: RequestHandler = async (req, res) => {
    const { params } = getValidated<Params>(res);
    await service.archive(req.auth!.userId, params.id);
    res.status(204).end();
  };

  return { list, get, create, update, archive };
}
