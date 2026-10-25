import type { Prisma } from '../../generated/prisma/client.js';
import { Errors } from '../../domain/errors.js';
import { MAX_STOCK } from '../../domain/inventory.js';
import { formatCents, multiplyCents } from '../../domain/money.js';
import type { Db } from '../../infrastructure/db.js';
import { withTransactionRetry } from '../../infrastructure/retry.js';
import { sha256Hex } from '../auth/tokens.js';
import { createAuditRepository } from '../audit/audit.repository.js';
import { toVehicleDto } from '../vehicles/vehicle.dto.js';
import { createVehicleRepository } from '../vehicles/vehicle.repository.js';
import { createIdempotencyRepository, createPurchaseRepository } from './purchase.repository.js';

export interface PurchaseResult {
  status: number;
  body: Prisma.InputJsonObject;
  replayed: boolean;
}

interface PurchaseRow {
  id: string;
  vehicleId: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: bigint;
  createdAt: Date;
  vehicle?: { id: string; make: string; model: string };
  user?: { id: string; email: string };
}

export const toPurchaseDto = (row: PurchaseRow) => ({
  id: row.id,
  vehicleId: row.vehicleId,
  quantity: row.quantity,
  unitPrice: formatCents(row.unitPriceCents),
  total: formatCents(Number(row.totalCents)),
  createdAt: row.createdAt.toISOString(),
  ...(row.vehicle && {
    vehicle: { id: row.vehicle.id, make: row.vehicle.make, model: row.vehicle.model },
  }),
  ...(row.user && { customer: { id: row.user.id, email: row.user.email } }),
});

export function createPurchaseService({ db }: { db: Db }) {
  return {
    /**
     * Purchase = one transaction: (idempotency check) -> conditional stock decrement ->
     * purchase row at the current price -> audit -> (idempotency record). Any failure rolls
     * everything back, so there is never a partial purchase.
     */
    purchase(
      userId: string,
      vehicleId: string,
      quantity: number,
      idempotencyKey?: string,
    ): Promise<PurchaseResult> {
      const requestHash = sha256Hex(`${vehicleId}:${quantity}`);

      return withTransactionRetry(() =>
        db.$transaction(
          async (tx): Promise<PurchaseResult> => {
            const idempotency = createIdempotencyRepository(tx);

            if (idempotencyKey) {
              await idempotency.lock(userId, idempotencyKey);
              const existing = await idempotency.find(userId, idempotencyKey);
              if (existing) {
                if (existing.requestHash !== requestHash) throw Errors.idempotencyKeyReused();
                return {
                  status: existing.responseStatus,
                  body: existing.responseBody as Prisma.InputJsonObject,
                  replayed: true,
                };
              }
            }

            const vehicles = createVehicleRepository(tx);
            if (!(await vehicles.decrementStock(vehicleId, quantity))) {
              // Nothing was changed; work out why for an accurate response.
              const vehicle = await vehicles.findActiveById(vehicleId);
              if (!vehicle) throw Errors.notFound('Vehicle');
              throw Errors.insufficientStock(vehicle.quantity);
            }

            // We hold the row lock from the UPDATE, so price and remaining stock are stable here.
            const vehicle = await vehicles.findActiveByIdOrThrow(vehicleId);
            const purchase = await createPurchaseRepository(tx).create({
              userId,
              vehicleId,
              quantity,
              unitPriceCents: vehicle.priceCents,
              totalCents: multiplyCents(vehicle.priceCents, quantity),
            });
            await createAuditRepository(tx).record({
              actorId: userId,
              action: 'VEHICLE_PURCHASED',
              targetType: 'vehicle',
              targetId: vehicleId,
              metadata: {
                purchaseId: purchase.id,
                quantity,
                totalCents: Number(purchase.totalCents),
              },
            });

            const body = { data: { ...toPurchaseDto(purchase), remainingStock: vehicle.quantity } };
            if (idempotencyKey) {
              await idempotency.save({
                userId,
                key: idempotencyKey,
                requestHash,
                purchaseId: purchase.id,
                responseStatus: 201,
                responseBody: body,
              });
            }
            return { status: 201, body, replayed: false };
          },
          { maxWait: 5_000, timeout: 10_000 },
        ),
      );
    },

    restock(actorId: string, vehicleId: string, quantity: number) {
      return withTransactionRetry(() =>
        db.$transaction(async (tx) => {
          const vehicles = createVehicleRepository(tx);
          if (!(await vehicles.incrementStock(vehicleId, quantity, MAX_STOCK))) {
            if (!(await vehicles.findActiveById(vehicleId))) throw Errors.notFound('Vehicle');
            throw Errors.conflict(
              `Restocking would exceed the maximum stock of ${MAX_STOCK} units.`,
            );
          }
          const vehicle = await vehicles.findActiveByIdOrThrow(vehicleId);
          await createAuditRepository(tx).record({
            actorId,
            action: 'VEHICLE_RESTOCKED',
            targetType: 'vehicle',
            targetId: vehicleId,
            metadata: { quantity, newQuantity: vehicle.quantity },
          });
          return toVehicleDto(vehicle);
        }),
      );
    },

    async listForUser(userId: string, page: number, pageSize: number) {
      return paginate(
        await createPurchaseRepository(db).listPage({ userId }, page, pageSize),
        page,
        pageSize,
      );
    },

    async listAll(page: number, pageSize: number) {
      return paginate(
        await createPurchaseRepository(db).listPage({}, page, pageSize),
        page,
        pageSize,
      );
    },
  };
}

function paginate(result: { rows: PurchaseRow[]; total: number }, page: number, pageSize: number) {
  return {
    data: result.rows.map(toPurchaseDto),
    pagination: {
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    },
  };
}

export type PurchaseService = ReturnType<typeof createPurchaseService>;
