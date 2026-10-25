import { useRef, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import type { Vehicle } from '../../shared/api/types';
import { formatMoney, totalFor } from '../../shared/lib/money';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import { Alert } from '../../shared/ui/States';
import { useToast } from '../../shared/ui/Toast';
import { purchaseApi } from './purchaseApi';

const MAX_PER_PURCHASE = 10;

interface Props {
  vehicle: Vehicle;
  onClose: () => void;
  /** Called with the server-reported stock after a successful purchase, or a refreshed stock figure. */
  onStockChanged: (vehicleId: string, remaining: number) => void;
}

export function PurchaseDialog({ vehicle, onClose, onStockChanged }: Props) {
  const toast = useToast();
  const limit = Math.min(MAX_PER_PURCHASE, vehicle.quantity);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per purchase intent: a retry after a network failure reuses it, so it can never double-charge.
  const idempotencyKey = useRef(crypto.randomUUID());

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const purchase = await purchaseApi.purchase(vehicle.id, quantity, idempotencyKey.current);
      onStockChanged(
        vehicle.id,
        purchase.remainingStock ?? Math.max(0, vehicle.quantity - quantity),
      );
      toast(
        'success',
        `Purchased ${quantity} × ${vehicle.make} ${vehicle.model} for ${formatMoney(purchase.total)}.`,
      );
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_STOCK') {
        const available = (e.details as { available?: number } | null)?.available ?? 0;
        onStockChanged(vehicle.id, available);
        setQuantity((q) => Math.max(1, Math.min(q, available)));
        idempotencyKey.current = crypto.randomUUID(); // definitive failure: a new attempt is a new intent
        setError(
          available === 0
            ? 'Sorry, this vehicle just sold out.'
            : `Only ${available} left. Adjust the quantity and try again.`,
        );
      } else {
        setError(e instanceof ApiError ? e.message : 'Purchase failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Confirm purchase"
      description={`${vehicle.make} ${vehicle.model}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="flex items-center justify-between">
          <span id="qty-label" className="font-semibold">
            Quantity
          </span>
          <div className="flex items-center gap-2" role="group" aria-labelledby="qty-label">
            <Button
              variant="secondary"
              aria-label="Decrease quantity"
              disabled={busy || quantity <= 1}
              onClick={() => setQuantity((q) => q - 1)}
            >
              −
            </Button>
            <output
              aria-live="polite"
              data-testid="quantity"
              className="w-10 text-center font-display text-3xl font-bold"
            >
              {quantity}
            </output>
            <Button
              variant="secondary"
              aria-label="Increase quantity"
              disabled={busy || quantity >= limit}
              onClick={() => setQuantity((q) => q + 1)}
            >
              +
            </Button>
          </div>
        </div>
        <dl className="space-y-1 border-y border-line py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Unit price</dt>
            <dd>{formatMoney(vehicle.price)}</dd>
          </div>
          <div className="flex justify-between text-base font-bold">
            <dt>Total</dt>
            <dd data-testid="total">{totalFor(vehicle.price, quantity)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted">
          The final price is confirmed by the server when you buy.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            busy={busy}
            disabled={vehicle.quantity === 0}
            onClick={() => void confirm()}
            data-autofocus
          >
            Buy now
          </Button>
        </div>
      </div>
    </Modal>
  );
}
