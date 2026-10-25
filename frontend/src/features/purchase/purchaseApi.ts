import { apiFetch } from '../../shared/api/client';
import type { Page, Purchase } from '../../shared/api/types';

export const purchaseApi = {
  /** The idempotency key makes a retry after a timeout safe: the server replays the first outcome. */
  purchase: (vehicleId: string, quantity: number, idempotencyKey: string) =>
    apiFetch<{ data: Purchase }>(`/api/vehicles/${vehicleId}/purchase`, {
      method: 'POST',
      body: { quantity },
      headers: { 'Idempotency-Key': idempotencyKey },
    }).then((r) => r.data),
  mine: (page: number, signal?: AbortSignal) =>
    apiFetch<Page<Purchase>>('/api/purchases/mine', { query: { page, pageSize: 10 }, signal }),
  all: (page: number, signal?: AbortSignal) =>
    apiFetch<Page<Purchase>>('/api/purchases', { query: { page, pageSize: 10 }, signal }),
};
