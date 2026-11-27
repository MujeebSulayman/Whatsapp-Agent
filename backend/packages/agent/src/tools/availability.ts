import type { PrismaClient } from '@wa/db';
import { RESERVE_MINUTES, reservedKey, stockSummary, variantList, type Reserved } from '@wa/shared';

interface Line { product_id?: string; variant?: string | null; quantity?: number; preorder?: boolean }

/** What open (placed, unpaid) orders are holding, so the same last item is not sold twice. Pre-orders hold nothing. */
export async function loadReserved(db: PrismaClient, businessId: string): Promise<Reserved> {
  const since = new Date(Date.now() - RESERVE_MINUTES * 60_000);
  const orders = await db.order.findMany({
    where: { businessId, status: 'pending', paymentStatus: { in: ['unpaid', 'pending'] }, createdAt: { gte: since } },
    select: { items: true },
    take: 500
  });
  const map: Reserved = new Map();
  for (const o of orders) {
    for (const l of (Array.isArray(o.items) ? o.items : []) as Line[]) {
      if (!l.product_id || l.preorder || !l.quantity) continue;
      const k = reservedKey(l.product_id, l.variant);
      map.set(k, (map.get(k) ?? 0) + l.quantity);
    }
  }
  return map;
}

interface P { id: string; imageUrls?: string[]; trackStock: boolean; stockQty: number; variants: unknown; restockNote: string | null; allowPreorder: boolean }

/** The facts about availability that the assistant may tell a customer. Everything here comes from the database. */
export function stockInfo(p: P, reserved: Reserved) {
  const s = stockSummary(p, reserved);
  const names = variantList(p.variants);
  return {
    photos: p.imageUrls?.length ?? 0,
    in_stock: s.inStock,
    ...(p.trackStock && s.left !== undefined ? { stock_qty: s.left } : { note: 'Not stock-limited (service or made to order)' }),
    ...(s.variants ? { variants: s.variants.map((v) => ({ name: v.name, in_stock: v.inStock, left: v.left })) } : names.length ? { variants: names.map((v) => v.name) } : {}),
    ...(!s.inStock
      ? {
          sold_out: true,
          ...(p.restockNote ? { restock_note: p.restockNote } : { restock_note: null }),
          preorder_available: p.allowPreorder,
          next: 'Sold out. Do not just say so: call suggest_alternatives, and offer join_waitlist' + (p.allowPreorder ? ' or a pre-order.' : '.')
        }
      : {})
  };
}
