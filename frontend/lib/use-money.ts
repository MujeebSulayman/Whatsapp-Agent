'use client';
import { useMemo } from 'react';
import { useApi } from './api';
import { currencyDigits, formatMoney, minorToInput, parseMoney } from './money';
import type { BusinessDetail } from './types';

/** Money helpers bound to the signed-in business's currency (cached; shared with every page). */
export function useMoney() {
  const { data } = useApi<BusinessDetail>('business');
  const currency = data?.currency ?? 'USD';
  return useMemo(() => ({
    currency,
    ready: !!data,
    digits: currencyDigits(currency),
    fmt: (minor: number) => formatMoney(minor, currency),
    parse: (text: string) => parseMoney(text, currency),
    toInput: (minor: number) => minorToInput(minor, currency),
    example: currencyDigits(currency) === 0 ? '1200' : '12.50'
  }), [currency, data]);
}
