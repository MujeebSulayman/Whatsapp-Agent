/**
 * Money is always an integer count of the currency's smallest unit ("minor units": cents, kobo, pence, ...).
 * Never floats. How many decimals a currency has comes from the ISO 4217 data built into Intl
 * (USD 2, NGN 2, JPY 0, KWD 3).
 */

/** Decimal places of a currency (e.g. 2 for USD/NGN, 0 for JPY, 3 for KWD). */
export function currencyDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** All ISO 4217 currency codes this runtime knows. */
export const supportedCurrencies = (): string[] => Intl.supportedValuesOf('currency');

export const isCurrencyCode = (code: string): boolean => /^[A-Z]{3}$/.test(code) && supportedCurrencies().includes(code);

/** 1250050 NGN -> "₦12,500.50"; whole amounts drop the decimals: "₦12,000". */
export function formatMoney(minor: number, currency: string, locale = 'en'): string {
  const digits = currencyDigits(currency);
  const major = minor / 10 ** digits;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: Number.isInteger(major) ? 0 : digits,
    maximumFractionDigits: digits
  }).format(major);
}

/**
 * "12,500.50" -> 1250050 (for 2-digit currencies), without floating point.
 * Accepts currency symbols, spaces and "," thousands separators; "." is the decimal separator.
 * Returns null for anything that isn't a plain amount.
 */
export function parseMoney(input: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  // Strip spaces, "," separators and a leading currency symbol/code, but never a minus sign.
  const cleaned = input.replace(/[\s,]/g, '').replace(/^[^\d-]+/, '');
  const m = cleaned.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const fraction = m[2] ?? '';
  if (fraction.length > digits) return null;
  return Number(m[1]) * 10 ** digits + Number(fraction.padEnd(digits, '0') || 0);
}

/** Minor units -> plain input text ("12500.5" -> "12500.50"), for editing forms. */
export function minorToInput(minor: number, currency: string): string {
  const digits = currencyDigits(currency);
  return (minor / 10 ** digits).toFixed(minor % 10 ** digits === 0 ? 0 : digits);
}
