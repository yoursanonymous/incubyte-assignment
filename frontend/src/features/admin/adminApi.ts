import { apiFetch } from '../../shared/api/client';
import type { Vehicle } from '../../shared/api/types';

export interface VehicleInput {
  make: string;
  model: string;
  category: string;
  price: string;
}

export const adminApi = {
  create: (input: VehicleInput & { quantity: number }) =>
    apiFetch<{ data: Vehicle }>('/api/vehicles', { method: 'POST', body: input }).then(
      (r) => r.data,
    ),
  update: (id: string, input: VehicleInput, expectedUpdatedAt: string) =>
    apiFetch<{ data: Vehicle }>(`/api/vehicles/${id}`, {
      method: 'PUT',
      body: { ...input, expectedUpdatedAt },
    }).then((r) => r.data),
  archive: (id: string) => apiFetch<void>(`/api/vehicles/${id}`, { method: 'DELETE' }),
  restock: (id: string, quantity: number) =>
    apiFetch<{ data: Vehicle }>(`/api/vehicles/${id}/restock`, {
      method: 'POST',
      body: { quantity },
    }).then((r) => r.data),
};
