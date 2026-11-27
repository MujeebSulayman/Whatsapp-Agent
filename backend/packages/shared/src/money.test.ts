import { describe, expect, it } from 'vitest';
import { currencyDigits, formatMoney, isCurrencyCode, minorToInput, parseMoney } from './money.js';

describe('money', () => {
  it('knows decimal places per currency', () => {
    expect([currencyDigits('USD'), currencyDigits('NGN'), currencyDigits('JPY'), currencyDigits('KWD')]).toEqual([2, 2, 0, 3]);
  });
  it('formats in the business currency, dropping .00', () => {
    expect(formatMoney(1_200_000, 'NGN')).toBe('₦12,000');
    expect(formatMoney(1_250_050, 'NGN')).toBe('₦12,500.50');
    expect(formatMoney(2499, 'USD')).toBe('$24.99');
    expect(formatMoney(5000, 'JPY')).toBe('¥5,000');
    expect(formatMoney(1500, 'KWD').replace(/\s/g, ' ')).toBe('KWD 1.500');
  });
  it('parses amounts to minor units without floating point', () => {
    expect(parseMoney('12,500.50', 'NGN')).toBe(1_250_050);
    expect(parseMoney('₦3000', 'NGN')).toBe(300_000);
    expect(parseMoney('$0.07', 'USD')).toBe(7);
    expect(parseMoney('19.99', 'USD')).toBe(1999); // 19.99 * 100 would be 1998.9999999999998
    expect(parseMoney('5000', 'JPY')).toBe(5000);
    expect(parseMoney('1.5', 'KWD')).toBe(1500);
  });
  it('rejects bad or too-precise amounts', () => {
    for (const bad of ['', 'abc', '12.345', '1.2.3', '-5']) expect(parseMoney(bad, 'USD'), bad).toBeNull();
    expect(parseMoney('10.5', 'JPY')).toBeNull();
  });
  it('round-trips through the edit form', () => {
    expect(minorToInput(1_200_000, 'NGN')).toBe('12000');
    expect(minorToInput(1999, 'USD')).toBe('19.99');
    expect(parseMoney(minorToInput(1999, 'USD'), 'USD')).toBe(1999);
  });
  it('validates currency codes', () => {
    expect(isCurrencyCode('NGN') && isCurrencyCode('USD') && isCurrencyCode('GHS')).toBe(true);
    expect(isCurrencyCode('XXX1') || isCurrencyCode('ngn') || isCurrencyCode('ZZZ')).toBe(false);
  });
});

import { countryName, isCountryCode, isTimezone } from './geo.js';
describe('geo', () => {
  it('validates countries and timezones', () => {
    expect(isCountryCode('NG') && isCountryCode('GH') && isCountryCode('US') && isCountryCode('KE')).toBe(true);
    expect(isCountryCode('XX') || isCountryCode('ng') || isCountryCode('NGA') || isCountryCode('')).toBe(false);
    expect(countryName('NG')).toBe('Nigeria');
    expect(isTimezone('Africa/Lagos') && isTimezone('America/New_York') && isTimezone('UTC')).toBe(true);
    expect(isTimezone('Mars/Base')).toBe(false);
  });
});

import { defaultCurrencyFor } from './geo.js';
describe('currency from country', () => {
  it('maps countries to their currency', () => {
    expect(['US', 'NG', 'GH', 'KE', 'JP', 'GB', 'IN', 'BR', 'ZA'].map(defaultCurrencyFor)).toEqual(['USD', 'NGN', 'GHS', 'KES', 'JPY', 'GBP', 'INR', 'BRL', 'ZAR']);
    expect(defaultCurrencyFor('DE')).toBe('EUR'); // eurozone
    expect(defaultCurrencyFor('XX')).toBeNull();
  });
});
