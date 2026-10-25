/**
 * Money is stored and computed as integer cents. Conversion from API input is done on the
 * decimal *string* so that binary floating-point never touches a monetary value
 * (e.g. 1.15 * 100 === 114.99999999999999 in IEEE-754).
 */

// Up to 8 whole digits and at most 2 decimals. ASCII digits only, no signs or exponents.
const MONEY_PATTERN = /^\d{1,8}(?:\.\d{1,2})?$/;

/**
 * Parses a JSON number or decimal string into integer cents.
 * Returns null for anything that is not a plain non-negative amount with at most two decimals.
 * Range limits (minimum/maximum price) are enforced by the caller's schema.
 */
export function parseMoney(input: unknown): number | null {
  let text: string;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    text = String(input); // shortest round-trip form; exponent forms fail the pattern below
  } else if (typeof input === 'string') {
    text = input.trim();
  } else {
    return null;
  }
  if (!MONEY_PATTERN.test(text)) return null;

  const [whole = '0', fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Formats integer cents as a plain decimal string such as "24999.99". */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError('cents must be a non-negative safe integer');
  }
  const whole = Math.trunc(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** Exact integer multiplication for totals; throws instead of silently losing precision. */
export function multiplyCents(unitCents: number, quantity: number): number {
  const total = unitCents * quantity;
  if (
    !Number.isSafeInteger(unitCents) ||
    !Number.isSafeInteger(quantity) ||
    !Number.isSafeInteger(total)
  ) {
    throw new RangeError('monetary calculation is not an exact integer');
  }
  return total;
}
