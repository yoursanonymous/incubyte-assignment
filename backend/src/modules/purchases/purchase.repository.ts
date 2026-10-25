import type { TxClient } from '../../infrastructure/db.js';

export function createPurchaseRepository(client: TxClient) {
  return {
    create: (data: {
      userId: string;
      vehicleId: string;
      quantity: number;
      unitPriceCents: number;
      totalCents: number;
    }) => client.purchase.create({ data: { ...data, totalCents: BigInt(data.totalCents) } }),

    async listPage(where: { userId?: string }, page: number, pageSize: number) {
      const [rows, total] = await Promise.all([
        client.purchase.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            vehicle: { select: { id: true, make: true, model: true } },
            user: { select: { id: true, email: true } },
          },
        }),
        client.purchase.count({ where }),
      ]);
      return { rows, total };
    },
  };
}

export function createIdempotencyRepository(client: TxClient) {
  const OPERATION = 'PURCHASE';
  return {
    find: (userId: string, key: string) =>
      client.idempotencyKey.findUnique({
        where: { userId_operation_key: { userId, operation: OPERATION, key } },
      }),

    save: (data: {
      userId: string;
      key: string;
      requestHash: string;
      purchaseId: string;
      responseStatus: number;
      responseBody: object;
    }) => client.idempotencyKey.create({ data: { ...data, operation: OPERATION } }),

    /** Serialises concurrent requests carrying the same key until the first transaction ends. */
    async lock(userId: string, key: string): Promise<void> {
      await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${OPERATION}:${key}`}, 0))`;
    },
  };
}
