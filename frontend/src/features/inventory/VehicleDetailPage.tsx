import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatMoney } from '../../shared/lib/money';
import { useRemote } from '../../shared/lib/useRemote';
import { Button } from '../../shared/ui/Button';
import { ErrorState, Skeleton } from '../../shared/ui/States';
import { StockBays } from '../../shared/ui/StockBays';
import { PurchaseDialog } from '../purchase/PurchaseDialog';
import { inventoryApi } from './inventoryApi';

export function VehicleDetailPage() {
  const { id = '' } = useParams();
  const { state, reload, patch } = useRemote((signal) => inventoryApi.get(id, signal), [id]);
  const [buying, setBuying] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link to="/" className="font-semibold underline">
        ← Back to inventory
      </Link>
      {state.status === 'loading' && (
        <div className="mt-6 space-y-3" aria-busy="true">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-40" />
        </div>
      )}
      {state.status === 'error' && (
        <div className="mt-6">
          <ErrorState message={state.message} onRetry={reload} />
        </div>
      )}
      {state.status === 'ready' &&
        (() => {
          const v = state.data;
          return (
            <article className="mt-6 rounded-lg border border-line bg-paper p-6 md:p-8">
              <p className="text-sm font-semibold uppercase tracking-wider text-muted">
                {v.make} · {v.category.charAt(0) + v.category.slice(1).toLowerCase()}
              </p>
              <h1 className="font-display text-6xl font-bold leading-none">{v.model}</h1>
              <p className="mt-4 font-display text-5xl font-bold">{formatMoney(v.price)}</p>
              <div className="mt-4">
                <StockBays quantity={v.quantity} />
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-6 text-sm sm:grid-cols-4">
                {[
                  ['Make', v.make],
                  ['Model', v.model],
                  ['Category', v.category.charAt(0) + v.category.slice(1).toLowerCase()],
                  ['Listed', new Date(v.createdAt).toLocaleDateString()],
                ].map(([k, val]) => (
                  <div key={k}>
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-semibold">{val}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-8">
                <Button
                  disabled={v.quantity === 0}
                  onClick={() => setBuying(true)}
                  className="w-full sm:w-auto sm:min-w-52"
                >
                  {v.quantity === 0 ? 'Sold out' : 'Purchase'}
                </Button>
              </div>
              {buying && (
                <PurchaseDialog
                  vehicle={v}
                  onClose={() => setBuying(false)}
                  onStockChanged={(_id, qty) => patch((d) => ({ ...d, quantity: qty }))}
                />
              )}
            </article>
          );
        })()}
    </div>
  );
}
