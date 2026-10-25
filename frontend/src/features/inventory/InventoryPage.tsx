import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Vehicle } from '../../shared/api/types';
import { useRemote } from '../../shared/lib/useRemote';
import { PaginationBar } from '../../shared/ui/Pagination';
import { Button } from '../../shared/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/States';
import { PurchaseDialog } from '../purchase/PurchaseDialog';
import { FilterBar } from './FilterBar';
import { inventoryApi, type VehicleFilters } from './inventoryApi';
import { VehicleCard } from './VehicleCard';

const KEYS = [
  'make',
  'model',
  'category',
  'minPrice',
  'maxPrice',
  'inStock',
  'sort',
  'order',
] as const;

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const [buying, setBuying] = useState<Vehicle | null>(null);

  // Filters live in the URL so searches are shareable and the back button works.
  const filters = useMemo<VehicleFilters>(() => {
    const f: VehicleFilters = { page: Math.max(1, Number(params.get('page')) || 1) };
    for (const key of KEYS) {
      const v = params.get(key);
      if (v) f[key] = v;
    }
    return f;
  }, [params]);

  const apply = (next: VehicleFilters) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next))
      if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) sp.set(k, String(v));
    setParams(sp);
  };

  const { state, reload, patch } = useRemote(
    (signal) => inventoryApi.list({ ...filters, pageSize: 12 }, signal),
    [filters],
  );

  const onStockChanged = (id: string, remaining: number) =>
    patch((page) => ({
      ...page,
      data: page.data.map((v) => (v.id === id ? { ...v, quantity: remaining } : v)),
    }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-display text-5xl font-bold leading-none">Inventory</h1>
        {state.status === 'ready' && (
          <p className="text-muted" aria-live="polite">
            {state.data.pagination.total}{' '}
            {state.data.pagination.total === 1 ? 'vehicle' : 'vehicles'}
          </p>
        )}
      </div>
      <FilterBar value={filters} onApply={apply} />

      <div className="mt-6" aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && (
          <ul aria-label="Loading vehicles" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-56" />
              </li>
            ))}
          </ul>
        )}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
        {state.status === 'ready' && state.data.data.length === 0 && (
          <EmptyState
            title="No vehicles match"
            action={
              <Button variant="secondary" onClick={() => apply({})}>
                Clear filters
              </Button>
            }
          >
            Try a broader search or remove a filter.
          </EmptyState>
        )}
        {state.status === 'ready' && state.data.data.length > 0 && (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.data.data.map((v) => (
                <li key={v.id}>
                  <VehicleCard vehicle={v} onPurchase={setBuying} />
                </li>
              ))}
            </ul>
            <PaginationBar
              pagination={state.data.pagination}
              onPage={(page) => apply({ ...filters, page })}
            />
          </>
        )}
      </div>
      {buying && (
        <PurchaseDialog
          vehicle={buying}
          onClose={() => setBuying(null)}
          onStockChanged={onStockChanged}
        />
      )}
    </div>
  );
}
