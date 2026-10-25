import { Errors } from '../../domain/errors.js';
import type { Db } from '../../infrastructure/db.js';
import { createAuditRepository } from '../audit/audit.repository.js';
import { toVehicleDto } from './vehicle.dto.js';
import { createVehicleRepository } from './vehicle.repository.js';
import type {
  CreateVehicleInput,
  ListVehiclesQuery,
  UpdateVehicleInput,
} from './vehicle.schemas.js';

export interface VehicleServiceDeps {
  db: Db;
  now?: () => Date;
}

export function createVehicleService({ db, now = () => new Date() }: VehicleServiceDeps) {
  return {
    async list(query: ListVehiclesQuery) {
      const { rows, total } = await createVehicleRepository(db).list(query);
      return {
        data: rows.map(toVehicleDto),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize),
        },
      };
    },

    async getById(id: string) {
      const vehicle = await createVehicleRepository(db).findActiveById(id);
      if (!vehicle) throw Errors.notFound('Vehicle');
      return toVehicleDto(vehicle);
    },

    /** Creates the vehicle and its audit event atomically. Caller has already enforced ADMIN. */
    create(actorId: string, input: CreateVehicleInput) {
      return db.$transaction(async (tx) => {
        const vehicle = await createVehicleRepository(tx).create({
          make: input.make,
          model: input.model,
          category: input.category,
          priceCents: input.price,
          quantity: input.quantity,
        });
        await createAuditRepository(tx).record({
          actorId,
          action: 'VEHICLE_CREATED',
          targetType: 'vehicle',
          targetId: vehicle.id,
          metadata: { priceCents: vehicle.priceCents, quantity: vehicle.quantity },
        });
        return toVehicleDto(vehicle);
      });
    },

    update(actorId: string, id: string, input: UpdateVehicleInput) {
      return db.$transaction(async (tx) => {
        const repo = createVehicleRepository(tx);
        const before = await repo.findActiveById(id);
        if (!before) throw Errors.notFound('Vehicle');

        const next = {
          make: input.make,
          model: input.model,
          category: input.category,
          priceCents: input.price,
        };
        const changedFields = (
          [
            ['make', before.make !== next.make],
            ['model', before.model !== next.model],
            ['category', before.category !== next.category],
            ['price', before.priceCents !== next.priceCents],
          ] as const
        )
          .filter(([, changed]) => changed)
          .map(([field]) => field);

        if (!(await repo.updateDetails(id, next, input.expectedUpdatedAt))) throw Errors.conflict();

        await createAuditRepository(tx).record({
          actorId,
          action: 'VEHICLE_UPDATED',
          targetType: 'vehicle',
          targetId: id,
          metadata: {
            changedFields,
            ...(before.priceCents !== next.priceCents && {
              priceCents: { from: before.priceCents, to: next.priceCents },
            }),
          },
        });
        return toVehicleDto(await repo.findActiveByIdOrThrow(id));
      });
    },

    /** Soft delete: the row and all purchase history are preserved. */
    archive(actorId: string, id: string) {
      return db.$transaction(async (tx) => {
        if (!(await createVehicleRepository(tx).archive(id, now())))
          throw Errors.notFound('Vehicle');
        await createAuditRepository(tx).record({
          actorId,
          action: 'VEHICLE_ARCHIVED',
          targetType: 'vehicle',
          targetId: id,
        });
      });
    },
  };
}

export type VehicleService = ReturnType<typeof createVehicleService>;
