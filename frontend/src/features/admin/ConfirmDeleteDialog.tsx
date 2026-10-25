import { useState } from 'react';
import { ApiError } from '../../shared/api/client';
import type { Vehicle } from '../../shared/api/types';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import { Alert } from '../../shared/ui/States';
import { useToast } from '../../shared/ui/Toast';
import { adminApi } from './adminApi';

export function ConfirmDeleteDialog({
  vehicle,
  onClose,
  onDeleted,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    try {
      await adminApi.archive(vehicle.id);
      toast('success', `${vehicle.make} ${vehicle.model} removed from inventory.`);
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Delete vehicle?"
      description={`${vehicle.make} ${vehicle.model} will disappear from inventory. Past purchases are kept for the records.`}
      onClose={onClose}
    >
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy} data-autofocus>
          Keep it
        </Button>
        <Button variant="danger" busy={busy} onClick={() => void remove()}>
          Delete vehicle
        </Button>
      </div>
    </Modal>
  );
}
