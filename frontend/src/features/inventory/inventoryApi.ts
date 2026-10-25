import { apiFetch } from '../../shared/api/client';
import type { Page, Vehicle } from '../../shared/api/types';

export interface VehicleFilters {
  make?: string;
  model?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  sort?: string;
  order?: string;
  page?: number;
  pageSize?: number;
}

export const inventoryApi = {
  list: (filters: VehicleFilters, signal?: AbortSignal) =>
    apiFetch<Page<Vehicle>>('/api/vehicles/search', { query: { ...filters }, signal }),
  get: (id: string, signal?: AbortSignal) =>
    apiFetch<{ data: Vehicle }>(`/api/vehicles/${id}`, { signal }).then((r) => r.data),
};
