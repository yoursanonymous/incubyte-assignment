import { z } from 'zod';
import { MAX_PRICE_CENTS, MAX_STOCK, VEHICLE_CATEGORIES } from '../../domain/inventory.js';
import { parseMoney } from '../../domain/money.js';

const PRICE_MESSAGE = 'must be a decimal amount with at most 2 decimal places';

const name = z.string().trim().min(1, 'is required').max(60, 'must be at most 60 characters');
const category = z.string().trim().toUpperCase().pipe(z.enum(VEHICLE_CATEGORIES));

/** A JSON number or decimal string, converted to integer cents without floating-point math. */
const priceCents = z
  .union([z.string(), z.number()])
  .transform((value) => parseMoney(value))
  .pipe(
    z
      .number({ error: PRICE_MESSAGE })
      .min(1, 'must be at least 0.01')
      .max(MAX_PRICE_CENTS, 'must be at most 10000000.00'),
  );

const priceFilterCents = z
  .string()
  .transform((value) => parseMoney(value))
  .pipe(z.number({ error: PRICE_MESSAGE }).min(0).max(MAX_PRICE_CENTS));

const intParam = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,9}$/, 'must be a whole number')
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

export const idParams = z.object({ id: z.uuid('must be a valid id') });

/** Strict objects reject unknown keys (id, archivedAt, …), which prevents mass assignment. */
export const createVehicleBody = z.strictObject({
  make: name,
  model: name,
  category,
  price: priceCents,
  quantity: z.number().int().min(0).max(MAX_STOCK).default(0),
});

/**
 * PUT replaces the editable catalogue fields. Stock is intentionally absent: it changes only
 * through purchase and restock so every change is atomic and audited.
 */
export const updateVehicleBody = z.strictObject({
  make: name,
  model: name,
  category,
  price: priceCents,
  /** Optional optimistic-concurrency token: the `updatedAt` the editor last saw. */
  expectedUpdatedAt: z.iso
    .datetime()
    .transform((value) => new Date(value))
    .optional(),
});

export const SORT_FIELDS = ['make', 'model', 'price', 'quantity', 'createdAt'] as const;

export const listVehiclesQuery = z
  .strictObject({
    page: intParam(1, 100_000).default(1),
    pageSize: intParam(1, 100).default(12),
    sort: z.enum(SORT_FIELDS).default('make'),
    order: z.enum(['asc', 'desc']).default('asc'),
    make: z.string().trim().min(1).max(60).optional(),
    model: z.string().trim().min(1).max(60).optional(),
    category: category.optional(),
    minPrice: priceFilterCents.optional(),
    maxPrice: priceFilterCents.optional(),
    inStock: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'minPrice must not be greater than maxPrice',
    path: ['minPrice'],
  });

export type CreateVehicleInput = z.infer<typeof createVehicleBody>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleBody>;
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuery>;
