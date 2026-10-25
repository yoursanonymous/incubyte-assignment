import { describe, expect, it } from 'vitest';
import { validateRestock, validateVehicleForm } from './validation';

const valid = {
  make: 'Honda',
  model: 'Civic',
  category: 'SEDAN',
  price: '24999.99',
  quantity: '4',
};

describe('validateVehicleForm', () => {
  it('accepts a valid vehicle', () =>
    expect(validateVehicleForm(valid, { withQuantity: true })).toEqual({}));
  it('requires make and model, max 60 chars', () => {
    expect(
      validateVehicleForm({ ...valid, make: '  ', model: '' }, { withQuantity: true }),
    ).toMatchObject({ make: expect.any(String), model: expect.any(String) });
    expect(
      validateVehicleForm({ ...valid, make: 'x'.repeat(61) }, { withQuantity: true }).make,
    ).toMatch(/60/);
  });
  it('requires a category', () => {
    expect(
      validateVehicleForm({ ...valid, category: '' }, { withQuantity: true }).category,
    ).toBeDefined();
  });
  it.each(['', 'abc', '-1', '0', '0.00', '10.999', '1e5', '10000000.01', '1,000'])(
    'rejects price %j',
    (price) => {
      expect(validateVehicleForm({ ...valid, price }, { withQuantity: true }).price).toBeDefined();
    },
  );
  it.each(['0.01', '10000000.00', '25000'])('accepts price %s', (price) => {
    expect(validateVehicleForm({ ...valid, price }, { withQuantity: true }).price).toBeUndefined();
  });
  it.each(['-1', '1.5', 'abc', '100001', ''])('rejects initial stock %j', (quantity) => {
    expect(
      validateVehicleForm({ ...valid, quantity }, { withQuantity: true }).quantity,
    ).toBeDefined();
  });
  it('ignores quantity when editing (stock is changed by restock only)', () => {
    expect(validateVehicleForm({ ...valid, quantity: 'junk' }, { withQuantity: false })).toEqual(
      {},
    );
  });
});

describe('validateRestock', () => {
  it.each([['1'], ['1000'], ['25']])('accepts %s', (q) =>
    expect(validateRestock(q)).toBeUndefined(),
  );
  it.each([[''], ['0'], ['-3'], ['1.5'], ['1001'], ['abc']])('rejects %j', (q) =>
    expect(validateRestock(q)).toBeDefined(),
  );
});
