/** Business limits shared by validation schemas and tests. Mirrors the database CHECK constraints. */
export const MAX_PRICE_CENTS = 1_000_000_000; // $10,000,000.00
export const MAX_STOCK = 100_000;
export const MAX_PURCHASE_QUANTITY = 10;
export const MAX_RESTOCK_QUANTITY = 1_000;
export const VEHICLE_CATEGORIES = [
  'SEDAN',
  'SUV',
  'TRUCK',
  'COUPE',
  'HATCHBACK',
  'CONVERTIBLE',
  'VAN',
  'WAGON',
] as const;
export type VehicleCategoryName = (typeof VEHICLE_CATEGORIES)[number];
