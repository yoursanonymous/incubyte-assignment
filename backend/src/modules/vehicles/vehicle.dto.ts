import type { Vehicle } from '../../generated/prisma/client.js';
import { formatCents } from '../../domain/money.js';

/** Whitelisted public shape of a vehicle. Money is an exact decimal string. */
export const toVehicleDto = (vehicle: Vehicle) => ({
  id: vehicle.id,
  make: vehicle.make,
  model: vehicle.model,
  category: vehicle.category,
  price: formatCents(vehicle.priceCents),
  quantity: vehicle.quantity,
  createdAt: vehicle.createdAt,
  updatedAt: vehicle.updatedAt,
});

export type VehicleDto = ReturnType<typeof toVehicleDto>;
