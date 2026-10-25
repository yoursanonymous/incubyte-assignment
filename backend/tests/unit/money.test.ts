import { describe, expect, it } from 'vitest';
import { formatCents, multiplyCents, parseMoney } from '../../src/domain/money.js';

describe('parseMoney (exact string-based conversion to integer cents)', () => {
  it.each([
    ['0.01', 1],
    ['1', 100],
    ['1.5', 150],
    ['24999.99', 2_499_999],
    ['10000000.00', 1_000_000_000],
    [19999.99, 1_999_999],
    [25000, 2_500_000],
    ['  42.10 ', 4_210],
  ])('parses %j as %d cents', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it('is not subject to binary floating-point error', () => {
    // 1.15 * 100 === 114.99999999999999 in IEEE-754; string parsing must give exactly 115.
    expect(parseMoney(1.15)).toBe(115);
    expect(parseMoney('0.29')).toBe(29);
    expect(parseMoney(0.29)).toBe(29);
  });

  it.each([
    '',
    'abc',
    '-1',
    '1.234',
    '1e3',
    '1,000.00',
    '0x10',
    '.',
    '1.',
    '.5',
    '١٢٣',
    'NaN',
    'Infinity',
    '100000000.00',
  ])('rejects %j', (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it.each([0.1 + 0.2, Number.NaN, Infinity, -5, 1e21, 1e-7, 12.345])('rejects number %s', (n) => {
    expect(parseMoney(n)).toBeNull();
  });

  it('rejects non string/number input', () => {
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney({})).toBeNull();
    expect(parseMoney(true)).toBeNull();
  });
});

describe('formatCents', () => {
  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [100, '1.00'],
    [2_499_999, '24999.99'],
    [1_000_000_000, '10000000.00'],
  ])('formats %d cents as %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  it('round-trips with parseMoney', () => {
    for (const cents of [1, 99, 100, 101, 123_456, 999_999_999]) {
      expect(parseMoney(formatCents(cents))).toBe(cents);
    }
  });
});

describe('multiplyCents', () => {
  it('multiplies exactly beyond the 32-bit range', () => {
    expect(multiplyCents(1_000_000_000, 10)).toBe(10_000_000_000);
  });
  it('rejects non-integer or unsafe results', () => {
    expect(() => multiplyCents(1.5, 2)).toThrow();
    expect(() => multiplyCents(Number.MAX_SAFE_INTEGER, 2)).toThrow();
  });
});
