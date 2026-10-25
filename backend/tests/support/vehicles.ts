import type { Db } from '../../src/infrastructure/db.js';

export type VehicleSeed = Partial<{
  make: string;
  model: string;
  category: 'SEDAN' | 'SUV' | 'TRUCK' | 'COUPE' | 'HATCHBACK' | 'CONVERTIBLE' | 'VAN' | 'WAGON';
  priceCents: number;
  quantity: number;
  archivedAt: Date | null;
}>;

/** Inserts a vehicle directly (bypassing the API) so tests control their own fixtures. */
export function seedVehicle(db: Db, overrides: VehicleSeed = {}) {
  return db.vehicle.create({
    data: {
      make: 'Toyota',
      model: 'Corolla',
      category: 'SEDAN',
      priceCents: 2_000_000,
      quantity: 5,
      ...overrides,
    },
  });
}

export const validVehicle = {
  make: 'Honda',
  model: 'Civic',
  category: 'SEDAN',
  price: '24999.99',
  quantity: 4,
};
