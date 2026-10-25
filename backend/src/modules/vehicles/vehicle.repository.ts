import type { Prisma, VehicleCategory } from '../../generated/prisma/client.js';
import type { TxClient } from '../../infrastructure/db.js';
import type { ListVehiclesQuery } from './vehicle.schemas.js';

const SORT_COLUMN = {
  make: 'make',
  model: 'model',
  price: 'priceCents',
  quantity: 'quantity',
  createdAt: 'createdAt',
} as const;

/**
 * Prisma's `contains` passes the text to LIKE unescaped, so `%`, `_` and `\` would act as
 * wildcards/escapes. Escape them so user input always matches literally.
 */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

function buildWhere(q: ListVehiclesQuery): Prisma.VehicleWhereInput {
  return {
    archivedAt: null,
    ...(q.make && { make: { contains: escapeLike(q.make), mode: 'insensitive' } }),
    ...(q.model && { model: { contains: escapeLike(q.model), mode: 'insensitive' } }),
    ...(q.category && { category: q.category as VehicleCategory }),
    ...((q.minPrice !== undefined || q.maxPrice !== undefined) && {
      priceCents: {
        ...(q.minPrice !== undefined && { gte: q.minPrice }),
        ...(q.maxPrice !== undefined && { lte: q.maxPrice }),
      },
    }),
    ...(q.inStock !== undefined && { quantity: q.inStock ? { gt: 0 } : { equals: 0 } }),
  };
}

/** Total order: the requested sort, then make/model, then id, so paging never repeats or skips rows. */
function buildOrderBy(q: ListVehiclesQuery): Prisma.VehicleOrderByWithRelationInput[] {
  const primary = SORT_COLUMN[q.sort];
  const order: Prisma.VehicleOrderByWithRelationInput[] = [{ [primary]: q.order }];
  for (const tie of ['make', 'model'] as const) if (primary !== tie) order.push({ [tie]: 'asc' });
  order.push({ id: 'asc' });
  return order;
}

export function createVehicleRepository(client: TxClient) {
  return {
    async list(q: ListVehiclesQuery) {
      const where = buildWhere(q);
      const [rows, total] = await Promise.all([
        client.vehicle.findMany({
          where,
          orderBy: buildOrderBy(q),
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        client.vehicle.count({ where }),
      ]);
      return { rows, total };
    },

    findActiveById: (id: string) => client.vehicle.findFirst({ where: { id, archivedAt: null } }),

    findActiveByIdOrThrow: (id: string) =>
      client.vehicle.findFirstOrThrow({ where: { id, archivedAt: null } }),

    create: (data: {
      make: string;
      model: string;
      category: VehicleCategory;
      priceCents: number;
      quantity: number;
    }) => client.vehicle.create({ data }),

    /** Conditional update; `expectedUpdatedAt` makes it fail (count 0) if someone else edited first. */
    async updateDetails(
      id: string,
      data: { make: string; model: string; category: VehicleCategory; priceCents: number },
      expectedUpdatedAt?: Date,
    ): Promise<boolean> {
      const { count } = await client.vehicle.updateMany({
        where: { id, archivedAt: null, ...(expectedUpdatedAt && { updatedAt: expectedUpdatedAt }) },
        data,
      });
      return count === 1;
    },

    /**
     * Atomic conditional decrement: a single UPDATE ... WHERE quantity >= n. PostgreSQL row-locks the
     * row, so concurrent buyers are serialised and the check-and-decrement cannot interleave.
     */
    async decrementStock(id: string, amount: number): Promise<boolean> {
      const { count } = await client.vehicle.updateMany({
        where: { id, archivedAt: null, quantity: { gte: amount } },
        data: { quantity: { decrement: amount } },
      });
      return count === 1;
    },

    /** Atomic increment guarded by the stock ceiling (also enforced by a CHECK constraint). */
    async incrementStock(id: string, amount: number, maxStock: number): Promise<boolean> {
      const { count } = await client.vehicle.updateMany({
        where: { id, archivedAt: null, quantity: { lte: maxStock - amount } },
        data: { quantity: { increment: amount } },
      });
      return count === 1;
    },

    /** Soft delete. Returns false when the vehicle does not exist or is already archived. */
    async archive(id: string, at: Date): Promise<boolean> {
      const { count } = await client.vehicle.updateMany({
        where: { id, archivedAt: null },
        data: { archivedAt: at },
      });
      return count === 1;
    },
  };
}

export type VehicleRepository = ReturnType<typeof createVehicleRepository>;
