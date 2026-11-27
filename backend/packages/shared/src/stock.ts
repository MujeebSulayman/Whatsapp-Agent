/**
 * Stock rules shared by the agent (what customers are told) and the API (what owners save).
 *
 * Two ways to hold stock:
 *  - one number for the product (`stockQty`), with optional variant names that share it; or
 *  - a number per variant (size, colour...), when EVERY variant has its own `stockQty`. Then the product total is their sum.
 * Items with `trackStock = false` (services, made to order) are never limited.
 */
export interface StockVariant { name: string; stockQty?: number | null; /** Photo of this option (e.g. the red one): a /media/<id> path or a URL. */ image?: string | null }
export interface StockProduct { id: string; trackStock: boolean; stockQty: number; variants: unknown }

/** Orders that are placed but not yet paid hold their items for a while so two customers can't buy the last one. */
export const RESERVE_MINUTES = 120;

/** Quantity held by open orders, keyed by `reservedKey(productId, variant)`. */
export type Reserved = Map<string, number>;
export const reservedKey = (productId: string, variant?: string | null) => `${productId}::${(variant ?? '').trim().toLowerCase()}`;

export function variantList(variants: unknown): StockVariant[] {
  if (!Array.isArray(variants)) return [];
  const out: StockVariant[] = [];
  for (const v of variants) {
    if (v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string') {
      const q = (v as { stockQty?: unknown }).stockQty;
      const img = (v as { image?: unknown }).image;
      out.push({ name: (v as { name: string }).name, stockQty: typeof q === 'number' ? q : null, ...(typeof img === 'string' && img ? { image: img } : {}) });
    }
  }
  return out;
}

export function isVariantTracked(p: Pick<StockProduct, 'trackStock' | 'variants'>): boolean {
  const vs = variantList(p.variants);
  return p.trackStock && vs.length > 0 && vs.every((v) => typeof v.stockQty === 'number');
}

export const findVariant = (p: Pick<StockProduct, 'variants'>, name: string | null | undefined): StockVariant | undefined =>
  name ? variantList(p.variants).find((v) => v.name.trim().toLowerCase() === name.trim().toLowerCase()) : undefined;

/** The product total as the owner sees it: the sum of variant stock, or the single number. */
export function totalStock(p: Pick<StockProduct, 'trackStock' | 'stockQty' | 'variants'>): number {
  return isVariantTracked(p) ? variantList(p.variants).reduce((s, v) => s + (v.stockQty ?? 0), 0) : p.stockQty;
}

function held(reserved: Reserved, p: StockProduct, variant: string | null | undefined): number {
  if (isVariantTracked(p)) return reserved.get(reservedKey(p.id, variant)) ?? 0;
  let sum = 0;
  for (const [k, q] of reserved) if (k.startsWith(`${p.id}::`)) sum += q;
  return sum;
}

/** How many can still be sold. `null` = not limited. Never negative. */
export function availableQty(p: StockProduct, variant: string | null | undefined, reserved: Reserved = new Map()): number | null {
  if (!p.trackStock) return null;
  if (isVariantTracked(p)) {
    const v = findVariant(p, variant);
    return Math.max(0, (v?.stockQty ?? 0) - held(reserved, p, variant));
  }
  return Math.max(0, p.stockQty - held(reserved, p, variant));
}

export interface StockSummary {
  inStock: boolean;
  /** Per variant, only when the owner tracks stock per variant. */
  variants?: { name: string; inStock: boolean; left: number }[];
  /** Total still sellable (undefined = not limited). */
  left?: number;
}

export function stockSummary(p: StockProduct, reserved: Reserved = new Map()): StockSummary {
  if (!p.trackStock) return { inStock: true };
  if (isVariantTracked(p)) {
    const variants = variantList(p.variants).map((v) => {
      const left = availableQty(p, v.name, reserved) ?? 0;
      return { name: v.name, inStock: left > 0, left };
    });
    const left = variants.reduce((s, v) => s + v.left, 0);
    return { inStock: left > 0, variants, left };
  }
  const left = availableQty(p, null, reserved) ?? 0;
  return { inStock: left > 0, left };
}

/** Decrement for a paid order line. Returns the new `variants` JSON and `stockQty`, or null when nothing changes. */
export function decrementStock(p: Pick<StockProduct, 'trackStock' | 'stockQty' | 'variants'>, variant: string | null | undefined, qty: number): { stockQty: number; variants?: StockVariant[] } | null {
  if (!p.trackStock) return null;
  if (isVariantTracked(p)) {
    const vs = variantList(p.variants);
    const i = vs.findIndex((v) => v.name.trim().toLowerCase() === (variant ?? '').trim().toLowerCase());
    if (i < 0) return null;
    const cur = vs[i]!.stockQty ?? 0;
    if (cur < qty) return null;
    vs[i] = { ...vs[i]!, stockQty: cur - qty };
    return { variants: vs, stockQty: vs.reduce((s, v) => s + (v.stockQty ?? 0), 0) };
  }
  if (p.stockQty < qty) return null;
  return { stockQty: p.stockQty - qty };
}
