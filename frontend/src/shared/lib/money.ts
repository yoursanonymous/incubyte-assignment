/** Money arithmetic on integer cents; the API's decimal strings are never routed through floats. */
const PATTERN = /^\d{1,8}(?:\.\d{1,2})?$/;

/** Decimal string ("24999.99") to integer cents, or null if it is not a valid amount. */
export function parseAmount(text: string): number | null {
  const value = text.trim();
  if (!PATTERN.test(value)) return null;
  const [whole = '0', fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function toCents(price: string): number {
  const cents = parseAmount(price);
  if (cents === null) throw new RangeError(`Invalid amount: ${price}`);
  return cents;
}

export function formatCents(cents: number): string {
  const whole = Math.trunc(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${whole}.${String(cents % 100).padStart(2, '0')}`;
}

export const formatMoney = (price: string): string => formatCents(toCents(price));

/** Total for display (the server computes and stores the authoritative total). */
export const totalFor = (unitPrice: string, quantity: number): string =>
  formatCents(toCents(unitPrice) * quantity);
