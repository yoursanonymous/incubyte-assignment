import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRemote } from '../../shared/lib/useRemote';
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/States';
import { PaginationBar } from '../../shared/ui/Pagination';
import { purchaseApi } from './purchaseApi';
import { PurchaseTable } from './PurchaseTable';

export function MyPurchasesPage() {
  const [page, setPage] = useState(1);
  const { state, reload } = useRemote((signal) => purchaseApi.mine(page, signal), [page]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-5xl font-bold leading-none">My orders</h1>
      <div className="mt-6" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <Skeleton className="h-48" />}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
        {state.status === 'ready' && state.data.data.length === 0 && (
          <EmptyState
            title="No orders yet"
            action={
              <Link to="/" className="font-semibold underline">
                Browse inventory
              </Link>
            }
          >
            Vehicles you buy will appear here.
          </EmptyState>
        )}
        {state.status === 'ready' && state.data.data.length > 0 && (
          <>
            <PurchaseTable rows={state.data.data} />
            <PaginationBar pagination={state.data.pagination} onPage={setPage} />
            <p className="mt-4 text-sm text-muted">
              Unit prices are the prices at the time of purchase.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
