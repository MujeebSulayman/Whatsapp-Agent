/**
 * What the assistant looked up earlier in THIS conversation, rebuilt from its saved tool results. Without it, every message starts
 * blind: it forgets product ids (and guesses them), and has to search again for things it showed a minute ago.
 */
interface Run { toolCalls: unknown }
interface Call { name?: string; result?: unknown }

const MAX_ITEMS = 40;

export function recentLookups(runs: Run[]): string | null {
  const items = new Map<string, string>();
  const areas = new Map<string, string>();
  // runs arrive newest first, so the first time we see an id is its freshest version
  for (const run of runs) {
    const calls = (Array.isArray(run.toolCalls) ? run.toolCalls : []) as Call[];
    for (const c of [...calls].reverse()) {
      const r = c.result as Record<string, unknown> | null | undefined;
      if (!r || typeof r !== 'object' || 'error' in r) continue;
      const rows: Record<string, unknown>[] = [
        ...(Array.isArray(r.results) ? (r.results as Record<string, unknown>[]) : []),
        ...(Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : []),
        ...(Array.isArray(r.similar_items) ? (r.similar_items as Record<string, unknown>[]) : [])
      ];
      for (const p of rows) {
        const id = typeof p.product_id === 'string' ? p.product_id : null;
        if (!id || items.has(id) || typeof p.name !== 'string') continue;
        const available = p.available ?? p.in_stock;
        const opts = Array.isArray(p.options) ? p.options : Array.isArray(p.variants) ? (p.variants as { name?: string }[]).map((v) => (typeof v === 'string' ? v : v.name)) : [];
        items.set(id, `- ${p.name} | id=${id}${typeof p.price === 'string' ? ` | ${p.price}` : ''}${available === false ? ' | sold out' : ''}${opts.length ? ` | options: ${opts.join(', ')}` : ''}`);
      }
      if (c.name === 'get_delivery_fee' && r.found === true && typeof r.area === 'string' && !areas.has(r.area)) areas.set(r.area, `${r.area}: ${String(r.fee)}${r.eta ? `, ${String(r.eta)}` : ''}`);
      if (Array.isArray(r.areas)) for (const a of r.areas as { area?: string; fee?: string; time?: string }[]) if (a.area && !areas.has(a.area)) areas.set(a.area, `${a.area}: ${a.fee ?? ''}${a.time ? `, ${a.time}` : ''}`);
    }
  }
  if (items.size === 0 && areas.size === 0) return null;
  return [
    'RECENTLY LOOKED UP IN THIS CHAT (real results from earlier in this conversation. Use these exact ids when placing an order; check stock with a tool again if the customer is about to buy.)',
    ...[...items.values()].slice(0, MAX_ITEMS),
    ...(areas.size ? [`Delivery: ${[...areas.values()].join('; ')}`] : [])
  ].join('\n');
}
