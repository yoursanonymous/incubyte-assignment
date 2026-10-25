import { z } from 'zod';
import { MAX_PURCHASE_QUANTITY, MAX_RESTOCK_QUANTITY } from '../../domain/inventory.js';
import { Errors } from '../../domain/errors.js';

// Price is deliberately NOT accepted: it is always read server-side at purchase time.
export const purchaseBody = z.strictObject({
  quantity: z.number().int().min(1).max(MAX_PURCHASE_QUANTITY).default(1),
});

export const restockBody = z.strictObject({
  quantity: z.number().int().min(1).max(MAX_RESTOCK_QUANTITY),
});

const page = z
  .string()
  .regex(/^\d{1,9}$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(100_000));
const pageSize = z
  .string()
  .regex(/^\d{1,9}$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(100));

export const listPurchasesQuery = z.strictObject({
  page: page.default(1),
  pageSize: pageSize.default(10),
});
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuery>;

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Parses the optional Idempotency-Key header. Present-but-invalid is a 400, never silently ignored. */
export function parseIdempotencyKey(header: string | string[] | undefined): string | undefined {
  if (header === undefined) return undefined;
  if (typeof header !== 'string' || !IDEMPOTENCY_KEY.test(header)) {
    throw Errors.validation([
      {
        in: 'header',
        path: 'Idempotency-Key',
        message: 'must be 1-128 characters: letters, digits, _ . : -',
      },
    ]);
  }
  return header;
}
