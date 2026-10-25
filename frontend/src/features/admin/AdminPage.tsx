import { useState } from 'react';
import type { Vehicle } from '../../shared/api/types';
import { formatMoney } from '../../shared/lib/money';
import { useRemote } from '../../shared/lib/useRemote';
import { Button } from '../../shared/ui/Button';
import { PaginationBar } from '../../shared/ui/Pagination';
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/States';
import { inventoryApi } from '../inventory/inventoryApi';
import { purchaseApi } from '../purchase/purchaseApi';
import { PurchaseTable } from '../purchase/PurchaseTable';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { RestockDialog } from './RestockDialog';
import { VehicleFormDialog } from './VehicleFormDialog';

type Dialog = { kind: 'create' } | { kind: 'edit' | 'restock' | 'delete'; vehicle: Vehicle } | null;

function VehiclesTab() {
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const { state, reload } = useRemote(
    (signal) => inventoryApi.list({ page, pageSize: 10, sort: 'make', order: 'asc' }, signal),
    [page],
  );

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setDialog({ kind: 'create' })}>Add vehicle</Button>
      </div>
      <div aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <Skeleton className="h-64" />}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
        {state.status === 'ready' && state.data.data.length === 0 && (
          <EmptyState title="Inventory is empty">Add your first vehicle to get started.</EmptyState>
        )}
        {state.status === 'ready' && state.data.data.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-paper">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">Vehicles in inventory</caption>
                <thead className="bg-asphalt text-paper">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Vehicle
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Category
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Price
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Stock
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.data.map((v) => (
                    <tr key={v.id} className="border-t border-line">
                      <th scope="row" className="px-4 py-3 font-semibold">
                        {v.make} {v.model}
                      </th>
                      <td className="px-4 py-3">
                        {v.category.charAt(0) + v.category.slice(1).toLowerCase()}
                      </td>
                      <td className="px-4 py-3 text-right">{formatMoney(v.price)}</td>
                      <td
                        className={`px-4 py-3 text-right font-bold ${v.quantity === 0 ? 'text-stop' : ''}`}
                      >
                        {v.quantity}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            onClick={() => setDialog({ kind: 'edit', vehicle: v })}
                            aria-label={`Edit ${v.make} ${v.model}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setDialog({ kind: 'restock', vehicle: v })}
                            aria-label={`Restock ${v.make} ${v.model}`}
                          >
                            Restock
                          </Button>
                          <Button
                            variant="ghost"
                            className="!text-stop"
                            onClick={() => setDialog({ kind: 'delete', vehicle: v })}
                            aria-label={`Delete ${v.make} ${v.model}`}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar pagination={state.data.pagination} onPage={setPage} />
          </>
        )}
      </div>
      {dialog?.kind === 'create' && (
        <VehicleFormDialog onClose={() => setDialog(null)} onSaved={reload} />
      )}
      {dialog?.kind === 'edit' && (
        <VehicleFormDialog
          vehicle={dialog.vehicle}
          onClose={() => setDialog(null)}
          onSaved={reload}
        />
      )}
      {dialog?.kind === 'restock' && (
        <RestockDialog vehicle={dialog.vehicle} onClose={() => setDialog(null)} onSaved={reload} />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDeleteDialog
          vehicle={dialog.vehicle}
          onClose={() => setDialog(null)}
          onDeleted={reload}
        />
      )}
    </>
  );
}

function SalesTab() {
  const [page, setPage] = useState(1);
  const { state, reload } = useRemote((signal) => purchaseApi.all(page, signal), [page]);
  return (
    <div aria-busy={state.status === 'loading'}>
      {state.status === 'loading' && <Skeleton className="h-48" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.data.length === 0 && (
        <EmptyState title="No sales yet" />
      )}
      {state.status === 'ready' && state.data.data.length > 0 && (
        <>
          <PurchaseTable rows={state.data.data} showCustomer />
          <PaginationBar pagination={state.data.pagination} onPage={setPage} />
        </>
      )}
    </div>
  );
}

export function AdminPage() {
  const [tab, setTab] = useState<'vehicles' | 'sales'>('vehicles');
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-5xl font-bold leading-none">Manage inventory</h1>
      <div
        role="tablist"
        aria-label="Management sections"
        className="mt-6 mb-5 flex gap-1 border-b border-line"
      >
        {(['vehicles', 'sales'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            className={`min-h-11 rounded-t-md px-5 font-display text-2xl font-bold capitalize ${tab === t ? 'bg-asphalt text-paper' : 'text-muted hover:text-ink'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'vehicles' ? <VehiclesTab /> : <SalesTab />}
      </div>
    </div>
  );
}
