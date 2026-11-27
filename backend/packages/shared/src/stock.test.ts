import { describe, expect, it } from 'vitest';
import { availableQty, decrementStock, isVariantTracked, reservedKey, stockSummary, totalStock, type Reserved } from './stock.js';

const shoe = { id: 'p1', trackStock: true, stockQty: 5, variants: [{ name: '42', stockQty: 3 }, { name: '43', stockQty: 0 }, { name: '44', stockQty: 2 }] };
const shared = { id: 'p2', trackStock: true, stockQty: 4, variants: [{ name: 'Red' }, { name: 'Blue' }] };
const service = { id: 'p3', trackStock: false, stockQty: 0, variants: null };

describe('stock', () => {
  it('knows when stock is held per variant', () => {
    expect(isVariantTracked(shoe)).toBe(true);
    expect(isVariantTracked(shared)).toBe(false);
    expect(isVariantTracked({ ...shoe, variants: [{ name: '42', stockQty: 3 }, { name: '43' }] })).toBe(false); // mixed: not per-variant
    expect(totalStock(shoe)).toBe(5);
    expect(totalStock(shared)).toBe(4);
  });

  it('answers per variant, so a sold-out size is not mistaken for the whole product', () => {
    expect(availableQty(shoe, '43')).toBe(0);
    expect(availableQty(shoe, 'size 42'.replace('size ', ''))).toBe(3);
    expect(availableQty(shoe, 'unknown')).toBe(0);
    const s = stockSummary(shoe);
    expect(s.inStock).toBe(true);
    expect(s.variants?.map((v) => `${v.name}:${v.left}`)).toEqual(['42:3', '43:0', '44:2']);
  });

  it('never limits services', () => {
    expect(availableQty(service, null)).toBeNull();
    expect(stockSummary(service)).toEqual({ inStock: true });
  });

  it('subtracts items held by unpaid orders', () => {
    const reserved: Reserved = new Map([[reservedKey('p1', '44'), 2], [reservedKey('p2', 'Red'), 3], [reservedKey('p2', 'Blue'), 1]]);
    expect(availableQty(shoe, '44', reserved)).toBe(0);
    expect(availableQty(shoe, '42', reserved)).toBe(3);
    expect(availableQty(shared, 'Red', reserved)).toBe(0); // shared stock: 4 - (3 + 1)
    expect(stockSummary(shared, reserved).inStock).toBe(false);
  });

  it('decrements the right variant on payment and refuses to go below zero', () => {
    const r = decrementStock(shoe, '42', 2)!;
    expect(r.variants?.find((v) => v.name === '42')?.stockQty).toBe(1);
    expect(r.stockQty).toBe(3);
    expect(decrementStock(shoe, '43', 1)).toBeNull();
    expect(decrementStock(shared, 'Red', 3)).toEqual({ stockQty: 1 });
    expect(decrementStock(service, null, 1)).toBeNull();
  });
});
