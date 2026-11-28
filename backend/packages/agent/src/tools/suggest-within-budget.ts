import { z } from 'zod';
import { currencyDigits, formatMoney } from '@wa/shared';
import { loadReserved, stockInfo } from './availability.js';
import { defineTool } from './types.js';

interface Item { id: string; name: string; price: number }
interface Combo { items: Item[]; total: number }

/** Walks every combination of up to `max` different items that fits the budget, keeping the best by `better`. Pure arithmetic, no guessing. */
function search(items: Item[], budget: number, max: number, accept: (c: Combo) => boolean, better: (a: Combo, b: Combo) => boolean): Combo | null {
  let best: Combo | null = null;
  const chosen: Item[] = [];
  const walk = (from: number, sum: number) => {
    if (chosen.length > 0) {
      const c = { items: [...chosen], total: sum };
      if (accept(c) && (!best || better(c, best))) best = c;
    }
    if (chosen.length === max) return;
    for (let i = from; i < items.length; i++) {
      const it = items[i]!;
      if (sum + it.price > budget) break; // items are sorted by price, so nothing after this fits either
      chosen.push(it);
      walk(i + 1, sum + it.price);
      chosen.pop();
    }
  };
  walk(0, 0);
  return best;
}

export const suggestWithinBudget = defineTool({
  name: 'suggest_within_budget',
  description:
    "Work out what the customer can buy for a budget. Use it whenever they give a budget or ask what they can get for an amount. Pass the budget as a plain number in the shop's currency (for 100k pass 100000). It does the arithmetic, so quote its totals exactly and never add prices yourself.",
  schema: z.object({
    budget: z.number().positive().max(1_000_000_000),
    /** Only combinations that include an item matching these words (e.g. "rice"). */
    must_include: z.string().trim().max(60).optional(),
    max_items: z.number().int().min(1).max(6).default(5)
  }),
  async run(ctx, { budget, must_include, max_items }) {
    const minorBudget = Math.round(budget * 10 ** currencyDigits(ctx.currency));
    const [rows, reserved] = await Promise.all([ctx.db.product.findMany({ where: { businessId: ctx.businessId, active: true }, take: 500 }), loadReserved(ctx.db, ctx.businessId)]);
    const buyable = rows.filter((p) => stockInfo(p, reserved).in_stock && p.priceMinor > 0 && p.priceMinor <= minorBudget).map((p) => ({ id: p.id, name: p.name, price: p.priceMinor }));
    buyable.sort((a, b) => a.price - b.price);
    // Keep the search quick on very large catalogues: all the cheap items, then an even spread of the rest.
    const items = buyable.length <= 40 ? buyable : [...buyable.slice(0, 20), ...buyable.slice(20).filter((_, i, a) => i % Math.ceil(a.length / 20) === 0)];

    const need = must_include?.toLowerCase();
    const accept = (c: Combo) => !need || c.items.some((i) => i.name.toLowerCase().includes(need));
    if (need && !buyable.some((i) => i.name.toLowerCase().includes(need))) return { error: `Nothing matching "${must_include}" fits that budget or is available. Say so and suggest other things.` };
    if (items.length === 0) {
      const cheapest = rows.filter((p) => stockInfo(p, reserved).in_stock && p.priceMinor > 0).sort((a, b) => a.priceMinor - b.priceMinor)[0];
      return { combos: [], note: cheapest ? `Nothing fits that budget. The cheapest item is ${cheapest.name} at ${formatMoney(cheapest.priceMinor, ctx.currency)}. Say so kindly.` : 'There is nothing available to suggest. Do not invent items.' };
    }

    // Three honest ways to spend it: closest to the budget, the most items, and a different pick that leaves out the priciest item of the first.
    const closest = search(items, minorBudget, max_items, accept, (a, b) => a.total > b.total || (a.total === b.total && a.items.length < b.items.length));
    const most = search(items, minorBudget, max_items, accept, (a, b) => a.items.length > b.items.length || (a.items.length === b.items.length && a.total > b.total));
    const anchor = closest ? [...closest.items].sort((a, b) => b.price - a.price)[0]! : null;
    const other = anchor ? search(items.filter((i) => i.id !== anchor.id), minorBudget, max_items, accept, (a, b) => a.total > b.total) : null;

    const seen = new Set<string>();
    const combos = [{ label: 'closest to your budget', c: closest }, { label: 'the most items', c: most }, { label: 'a different mix', c: other }]
      .filter((x): x is { label: string; c: Combo } => !!x.c)
      .filter((x) => { const key = x.c.items.map((i) => i.id).sort().join(','); if (seen.has(key)) return false; seen.add(key); return true; })
      .map(({ label, c }) => ({
        label,
        items: c.items.map((i) => ({ product_id: i.id, name: i.name, price: formatMoney(i.price, ctx.currency) })),
        total: formatMoney(c.total, ctx.currency),
        left: formatMoney(minorBudget - c.total, ctx.currency)
      }));
    return { budget: formatMoney(minorBudget, ctx.currency), combos, note: 'Totals are exact. Present these as options, say delivery is extra and the order total is confirmed when the order is created, and ask which they prefer. One of each item unless they want more.' };
  }
});
