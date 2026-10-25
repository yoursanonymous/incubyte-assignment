import { describe, expect, it } from 'vitest';
import { formatMoney, totalFor, toCents } from './money';

describe('money helpers (exact, string/integer based)', () => {
  it.each([
    ['0.01', '$0.01'],
    ['5', '$5.00'],
    ['24999.99', '$24,999.99'],
    ['10000000.00', '$10,000,000.00'],
    ['1234.5', '$1,234.50'],
  ])('formats %s as %s', (input, output) => {
    expect(formatMoney(input)).toBe(output);
  });

  it('parses to integer cents without floating-point error', () => {
    expect(toCents('1.15')).toBe(115);
    expect(toCents('0.29')).toBe(29);
    expect(toCents('24999.99')).toBe(2_499_999);
  });

  it('computes totals exactly', () => {
    expect(totalFor('24999.99', 3)).toBe('$74,999.97');
    expect(totalFor('0.10', 3)).toBe('$0.30'); // 0.1 * 3 === 0.30000000000000004 in floating point
  });
});
