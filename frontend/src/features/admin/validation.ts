import { CATEGORIES } from '../../shared/api/types';
import { parseAmount } from '../../shared/lib/money';
import type { FieldErrors } from '../auth/validation';

export interface VehicleFormValues {
  make: string;
  model: string;
  category: string;
  price: string;
  quantity: string;
}
type Field = keyof VehicleFormValues;

const MAX_PRICE_CENTS = 1_000_000_000;
const MAX_STOCK = 100_000;
export const MAX_RESTOCK = 1_000;

const isWhole = (text: string) => /^\d{1,9}$/.test(text.trim());

export function validateVehicleForm(
  v: VehicleFormValues,
  { withQuantity }: { withQuantity: boolean },
): FieldErrors<Field> {
  const errors: FieldErrors<Field> = {};
  for (const field of ['make', 'model'] as const) {
    const value = v[field].trim();
    if (!value) errors[field] = `Enter the ${field}.`;
    else if (value.length > 60) errors[field] = `Use at most 60 characters.`;
  }
  if (!(CATEGORIES as readonly string[]).includes(v.category))
    errors.category = 'Choose a category.';

  const cents = parseAmount(v.price);
  if (cents === null) errors.price = 'Enter an amount such as 24999.99 (at most 2 decimals).';
  else if (cents < 1) errors.price = 'Price must be at least 0.01.';
  else if (cents > MAX_PRICE_CENTS) errors.price = 'Price must be at most 10,000,000.00.';

  if (withQuantity && (!isWhole(v.quantity) || Number(v.quantity) > MAX_STOCK)) {
    errors.quantity = `Enter a whole number from 0 to ${MAX_STOCK.toLocaleString('en-US')}.`;
  }
  return errors;
}

export function validateRestock(quantity: string): string | undefined {
  if (!isWhole(quantity) || Number(quantity) < 1 || Number(quantity) > MAX_RESTOCK) {
    return `Enter a whole number from 1 to ${MAX_RESTOCK.toLocaleString('en-US')}.`;
  }
  return undefined;
}
