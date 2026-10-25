import { useState, type FormEvent } from 'react';
import { CATEGORIES } from '../../shared/api/types';
import { parseAmount } from '../../shared/lib/money';
import { Button } from '../../shared/ui/Button';
import { SelectField, TextField } from '../../shared/ui/Field';
import type { VehicleFilters } from './inventoryApi';

export const SORTS: Record<string, { sort: string; order: string; label: string }> = {
  'make-asc': { sort: 'make', order: 'asc', label: 'Make A–Z' },
  'price-asc': { sort: 'price', order: 'asc', label: 'Price: low to high' },
  'price-desc': { sort: 'price', order: 'desc', label: 'Price: high to low' },
  'createdAt-desc': { sort: 'createdAt', order: 'desc', label: 'Newest first' },
};

interface Props {
  value: VehicleFilters;
  onApply: (next: VehicleFilters) => void;
}

export function FilterBar({ value, onApply }: Props) {
  const [errors, setErrors] = useState<{ price?: string }>({});
  const sortKey = `${value.sort ?? 'make'}-${value.order ?? 'asc'}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (name: string) => String(form.get(name) ?? '').trim();
    const min = get('minPrice');
    const max = get('maxPrice');
    const minCents = min ? parseAmount(min) : 0;
    const maxCents = max ? parseAmount(max) : Infinity;

    if (minCents === null || maxCents === null)
      return setErrors({ price: 'Prices must be amounts like 25000 or 24999.99.' });
    if (minCents > maxCents)
      return setErrors({ price: 'Minimum price cannot exceed maximum price.' });
    setErrors({});
    onApply({
      ...value,
      make: get('make') || undefined,
      model: get('model') || undefined,
      category: get('category') || undefined,
      minPrice: min || undefined,
      maxPrice: max || undefined,
      inStock: form.get('inStock') ? 'true' : undefined,
      page: 1,
    });
  }

  const hasFilters = Boolean(
    value.make ||
    value.model ||
    value.category ||
    value.minPrice ||
    value.maxPrice ||
    value.inStock,
  );

  return (
    <form
      key={JSON.stringify(value)}
      role="search"
      aria-label="Filter vehicles"
      onSubmit={submit}
      noValidate
      className="rounded-lg border border-line bg-paper p-4"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <TextField label="Make" name="make" defaultValue={value.make} placeholder="Toyota" />
        <TextField label="Model" name="model" defaultValue={value.model} placeholder="Corolla" />
        <SelectField
          label="Category"
          name="category"
          defaultValue={value.category ?? ''}
          className="col-span-2 md:col-span-1"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Min price ($)"
          name="minPrice"
          inputMode="decimal"
          defaultValue={value.minPrice}
          placeholder="0"
          error={errors.price ? ' ' : undefined}
        />
        <TextField
          label="Max price ($)"
          name="maxPrice"
          inputMode="decimal"
          defaultValue={value.maxPrice}
          placeholder="any"
          error={errors.price ? ' ' : undefined}
        />
        <div className="col-span-2 flex items-end md:col-span-1">
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input
              type="checkbox"
              name="inStock"
              defaultChecked={value.inStock === 'true'}
              className="size-5 accent-asphalt"
            />{' '}
            In stock only
          </label>
        </div>
      </div>
      {errors.price && (
        <p role="alert" className="mt-2 text-sm font-medium text-stop">
          {errors.price}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-2">
          <Button type="submit">Search</Button>
          {hasFilters && (
            <Button
              variant="secondary"
              onClick={() => onApply({ sort: value.sort, order: value.order, page: 1 })}
            >
              Clear filters
            </Button>
          )}
        </div>
        <SelectField
          label="Sort by"
          value={sortKey}
          onChange={(e) => {
            const s = SORTS[e.target.value]!;
            onApply({ ...value, sort: s.sort, order: s.order, page: 1 });
          }}
          className="w-52"
        >
          {Object.entries(SORTS).map(([key, s]) => (
            <option key={key} value={key}>
              {s.label}
            </option>
          ))}
        </SelectField>
      </div>
    </form>
  );
}
