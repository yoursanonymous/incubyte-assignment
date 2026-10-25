import { useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api/client';
import { CATEGORIES, type Vehicle } from '../../shared/api/types';
import { Button } from '../../shared/ui/Button';
import { SelectField, TextField } from '../../shared/ui/Field';
import { Modal } from '../../shared/ui/Modal';
import { Alert } from '../../shared/ui/States';
import { useToast } from '../../shared/ui/Toast';
import { adminApi } from './adminApi';
import { validateVehicleForm, type VehicleFormValues } from './validation';
import type { FieldErrors } from '../auth/validation';

interface Props {
  vehicle?: Vehicle;
  onClose: () => void;
  onSaved: () => void;
}

export function VehicleFormDialog({ vehicle, onClose, onSaved }: Props) {
  const editing = Boolean(vehicle);
  const toast = useToast();
  const [errors, setErrors] = useState<FieldErrors<keyof VehicleFormValues>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: VehicleFormValues = {
      make: String(form.get('make') ?? ''),
      model: String(form.get('model') ?? ''),
      category: String(form.get('category') ?? ''),
      price: String(form.get('price') ?? ''),
      quantity: String(form.get('quantity') ?? '0'),
    };
    const found = validateVehicleForm(values, { withQuantity: !editing });
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    const input = {
      make: values.make.trim(),
      model: values.model.trim(),
      category: values.category,
      price: values.price.trim(),
    };
    setBusy(true);
    try {
      if (vehicle) await adminApi.update(vehicle.id, input, vehicle.updatedAt);
      else await adminApi.create({ ...input, quantity: Number(values.quantity) });
      toast('success', editing ? 'Vehicle updated.' : 'Vehicle added.');
      onSaved();
      onClose();
    } catch (e) {
      setServerError(
        e instanceof ApiError
          ? e.code === 'CONFLICT'
            ? 'Someone else changed this vehicle. Close this form and reopen it to see the latest details.'
            : e.message
          : 'Could not save. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? 'Edit vehicle' : 'Add vehicle'}
      onClose={onClose}
      description={editing ? 'Stock is changed with Restock, not here.' : undefined}
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {serverError && <Alert>{serverError}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Make"
            name="make"
            defaultValue={vehicle?.make}
            error={errors.make}
            data-autofocus
          />
          <TextField
            label="Model"
            name="model"
            defaultValue={vehicle?.model}
            error={errors.model}
          />
        </div>
        <SelectField
          label="Category"
          name="category"
          defaultValue={vehicle?.category ?? ''}
          error={errors.category}
        >
          <option value="" disabled>
            Choose…
          </option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Price ($)"
            name="price"
            inputMode="decimal"
            defaultValue={vehicle?.price}
            error={errors.price}
          />
          {!editing && (
            <TextField
              label="Initial stock"
              name="quantity"
              inputMode="numeric"
              defaultValue="1"
              error={errors.quantity}
            />
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {editing ? 'Save changes' : 'Add vehicle'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
