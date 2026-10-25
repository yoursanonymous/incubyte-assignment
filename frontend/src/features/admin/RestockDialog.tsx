import { useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api/client';
import type { Vehicle } from '../../shared/api/types';
import { Button } from '../../shared/ui/Button';
import { TextField } from '../../shared/ui/Field';
import { Modal } from '../../shared/ui/Modal';
import { Alert } from '../../shared/ui/States';
import { useToast } from '../../shared/ui/Toast';
import { adminApi } from './adminApi';
import { validateRestock } from './validation';

export function RestockDialog({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [error, setError] = useState<string>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = String(new FormData(event.currentTarget).get('quantity') ?? '');
    const problem = validateRestock(quantity);
    setError(problem);
    setServerError(null);
    if (problem) return;
    setBusy(true);
    try {
      const updated = await adminApi.restock(vehicle.id, Number(quantity));
      toast('success', `${vehicle.make} ${vehicle.model} now has ${updated.quantity} in stock.`);
      onSaved();
      onClose();
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Could not restock. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Restock"
      description={`${vehicle.make} ${vehicle.model} · currently ${vehicle.quantity} in stock`}
      onClose={onClose}
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {serverError && <Alert>{serverError}</Alert>}
        <TextField
          label="Units to add"
          name="quantity"
          inputMode="numeric"
          defaultValue="1"
          error={error}
          data-autofocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Add stock
          </Button>
        </div>
      </form>
    </Modal>
  );
}
