import { countries, getEmojiFlag, type TCountryCode } from 'countries-list';
import { supportedCurrencies } from './money';

export interface Country { code: string; name: string; flag: string; currencies: string[]; phone: string }

/** Accent-insensitive, engine-independent ordering (server and browser must produce identical lists). */
const sortKey = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Every country that has a currency, sorted by name. Pure static data: identical on server and browser. */
export const COUNTRIES: Country[] = Object.entries(countries)
  .filter(([, c]) => c.currency.length > 0)
  .map(([code, c]) => ({ code, name: c.name, flag: getEmojiFlag(code as TCountryCode), currencies: c.currency, phone: `+${c.phone[0] ?? ''}` }))
  .sort((a, b) => sortKey(a.name) < sortKey(b.name) ? -1 : sortKey(a.name) > sortKey(b.name) ? 1 : 0);

/** First of the country's ISO 4217 currencies that this browser supports. Call in the browser only. */
export function defaultCurrency(code: string): string {
  const supported = new Set(supportedCurrencies());
  return countryByCode(code)?.currencies.find((c) => supported.has(c)) ?? '';
}

export const countryByCode = (code: string): Country | undefined => COUNTRIES.find((c) => c.code === code);

/** Best guess of the visitor's country from their browser language (e.g. "en-NG" -> "NG"). */
export function guessCountry(): string {
  try {
    for (const lang of navigator.languages ?? [navigator.language]) {
      const region = new Intl.Locale(lang).region;
      if (region && countryByCode(region)) return region;
    }
  } catch { /* unsupported: the user picks */ }
  return '';
}

export function guessTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export const timezoneOptions = (): string[] => Intl.supportedValuesOf('timeZone');

export function currencyOptions(): { code: string; label: string }[] {
  const names = new Intl.DisplayNames(['en'], { type: 'currency' });
  return supportedCurrencies().map((code) => ({ code, label: `${code} · ${names.of(code) ?? code}` })).sort((a, b) => a.code.localeCompare(b.code));
}

/** IANA timezones for a country (primary first), from the browser's own locale data. */
export function timezonesForCountry(code: string): string[] {
  try {
    const loc = new Intl.Locale(`en-${code}`) as Intl.Locale & { getTimeZones?: () => string[]; timeZones?: string[] };
    return loc.getTimeZones?.() ?? loc.timeZones ?? [];
  } catch {
    return [];
  }
}
