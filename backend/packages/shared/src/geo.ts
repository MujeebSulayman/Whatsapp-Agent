/** Country and timezone helpers backed by the runtime's built-in ICU data (no extra dependency). */
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** ISO 3166-1 alpha-2, e.g. "NG", "GH", "US". */
export function isCountryCode(code: string): boolean {
  if (!/^[A-Z]{2}$/.test(code)) return false;
  try {
    const name = regionNames.of(code);
    return !!name && name !== code;
  } catch {
    return false;
  }
}

export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

let zones: Set<string> | null = null;
/** IANA timezone, e.g. "Africa/Lagos". */
export function isTimezone(tz: string): boolean {
  zones ??= new Set(Intl.supportedValuesOf('timeZone'));
  return tz === 'UTC' || zones.has(tz);
}

import { countries } from 'countries-list';
import { isCurrencyCode } from './money.js';

/** The currency a country uses, e.g. US -> USD, NG -> NGN, JP -> JPY. First supported ISO 4217 code; null if none. */
export function defaultCurrencyFor(country: string): string | null {
  const entry = (countries as Record<string, { currency: string[] } | undefined>)[country];
  return entry?.currency.find(isCurrencyCode) ?? null;
}
