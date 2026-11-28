import { z } from 'zod';

/**
 * The setup every business must finish before its assistant talks to customers. Kept as plain answers (not one free-text box) so the
 * system can check them, enforce them, and give the assistant exact facts instead of a paragraph to interpret.
 */
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];
export const DAY_NAMES: Record<Day, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
export const PAY_METHODS = ['bank_transfer', 'card_link', 'cash_on_delivery', 'pay_at_shop'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

const TIME = '([01]\\d|2[0-3]):[0-5]\\d';
const DayHours = z.union([z.literal('closed'), z.string().regex(new RegExp(`^${TIME}-${TIME}$`), 'Use times like 09:00-20:00').refine((v) => v.slice(0, 5) !== v.slice(6), 'Opening and closing time are the same')]);

/** What the setup screen sends. Every field is optional so people can save as they go; completeness is judged by `setupItems`. */
export const SetupInput = z.object({
  hours: z.object(Object.fromEntries(DAYS.map((d) => [d, DayHours.optional()])) as Record<Day, z.ZodOptional<typeof DayHours>>).optional(),
  payMethods: z.array(z.enum(PAY_METHODS)).max(4).optional(),
  bankName: z.string().trim().max(80).nullable().optional(),
  bankAccountNumber: z.string().trim().regex(/^\d{6,20}$/, 'Digits only').nullable().optional(),
  bankAccountName: z.string().trim().max(100).nullable().optional(),
  fulfilment: z.enum(['delivery', 'pickup', 'both', 'visit', 'onsite']).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  returnType: z.enum(['none', 'exchange', 'refund']).nullable().optional(),
  returnDays: z.number().int().min(1).max(365).nullable().optional(),
  cancellationHours: z.number().int().min(0).max(720).nullable().optional(),
  depositRequired: z.boolean().nullable().optional(),
  ownerPhone: z.string().regex(/^\d{8,15}$/, 'Digits only, with country code').nullable().optional()
});
export type SetupInput = z.infer<typeof SetupInput>;

/** The business as the setup rules see it: plain values, whatever the database or screen it came from. */
export interface SetupFacts {
  kind: 'goods' | 'services' | 'both';
  currency: string;
  businessHours: unknown;
  paymentInfo: string | null;
  returnPolicy: string | null;
  ownerPhone: string | null;
  payMethods: string[];
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  fulfilment: string | null;
  address: string | null;
  returnType: string | null;
  returnDays: number | null;
  cancellationHours: number | null;
  depositRequired: boolean | null;
  /** Online payments are connected, so a payment link can really be sent */
  cardLinkReady: boolean;
  /** Active items with a price */
  products: number;
  /** Delivery or service areas */
  zones: number;
}

/** The payment methods that really work: a card link only counts once online payments are connected. */
const methodsOf = (f: SetupFacts) => f.payMethods.filter((m) => m !== 'card_link' || f.cardLinkReady);
const filled = (s: string | null | undefined) => !!s && s.trim().length > 0;
const sellsServices = (k: SetupFacts['kind']) => k === 'services' || k === 'both';
const sellsGoods = (k: SetupFacts['kind']) => k === 'goods' || k === 'both';

export function weeklyHours(h: unknown): Partial<Record<Day, string>> | null {
  if (!h || typeof h !== 'object') return null;
  const o = h as Record<string, unknown>;
  const out: Partial<Record<Day, string>> = {};
  for (const d of DAYS) if (typeof o[d] === 'string' && /^(closed|\d\d:\d\d-\d\d:\d\d)$/.test(o[d] as string)) out[d] = o[d] as string;
  return Object.keys(out).length ? out : null;
}

const to12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${suffix}`;
};

/** Opening hours as the assistant reads them. Understands the day-by-day answers and the older free-form ones. */
export function formatHours(h: unknown): string {
  const week = weeklyHours(h);
  if (week) {
    return DAYS.map((d) => {
      const v = week[d];
      return v === undefined ? null : `${DAY_NAMES[d]} ${v === 'closed' ? 'closed' : `${to12(v.slice(0, 5))} to ${to12(v.slice(6))}`}`;
    }).filter(Boolean).join('; ');
  }
  if (h && typeof h === 'object') return Object.entries(h as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join('; ') || 'not set';
  return 'not set';
}

/** How customers pay, in words. Falls back to the older free-text box for businesses that never used the new fields. */
export function paymentText(f: SetupFacts): string {
  const methods = methodsOf(f);
  if (f.payMethods.length === 0) return filled(f.paymentInfo) ? f.paymentInfo!.trim() : '';
  const parts: string[] = [];
  if (methods.includes('bank_transfer')) parts.push(`Bank transfer to ${f.bankName ?? 'the bank'} account ${f.bankAccountNumber ?? ''} (${f.bankAccountName ?? 'the business'}). The shop confirms once it arrives`.replace(/ +/g, ' '));
  if (methods.includes('card_link')) parts.push('Online payment link (card or bank)');
  if (methods.includes('cash_on_delivery')) parts.push('Cash on delivery');
  if (methods.includes('pay_at_shop')) parts.push(sellsServices(f.kind) && !sellsGoods(f.kind) ? 'Pay in person after the session' : 'Pay in person at the shop');
  return parts.join('. ');
}

export function returnsText(f: SetupFacts): string {
  if (!f.returnType) return filled(f.returnPolicy) ? f.returnPolicy!.trim() : '';
  if (f.returnType === 'none') return 'No returns or refunds.';
  const d = f.returnDays ?? 0;
  return f.returnType === 'exchange' ? `Exchanges within ${d} day${d === 1 ? '' : 's'} if unused.` : `Refunds within ${d} day${d === 1 ? '' : 's'}.`;
}

/** Facts and rules the assistant is given, each one a short exact sentence, including what is NOT offered. */
export function policyLines(f: SetupFacts): string[] {
  const lines: string[] = [];
  const goods = sellsGoods(f.kind);
  if (f.fulfilment) {
    const where = f.address ? ` at ${f.address}` : '';
    if (f.fulfilment === 'delivery') lines.push('We deliver. Pickup is NOT available.');
    if (f.fulfilment === 'pickup') lines.push(`Pickup only${where}. We do NOT deliver.`);
    if (f.fulfilment === 'both') lines.push(`We deliver, and customers can also pick up${where}.`);
    if (f.fulfilment === 'visit') lines.push('We come to the customer. Customers do not come to us.');
    if (f.fulfilment === 'onsite') lines.push(`Customers come to us${where}. We do NOT visit them.`);
  }
  const methods = methodsOf(f);
  if (f.payMethods.length) {
    if (goods && !methods.includes('cash_on_delivery')) lines.push('Cash on delivery is NOT available.');
    if (!methods.includes('bank_transfer')) lines.push('Bank transfer is NOT accepted.');
  }
  if (sellsServices(f.kind)) {
    if (f.cancellationHours !== null) lines.push(f.cancellationHours === 0 ? 'Bookings can be cancelled at any time.' : `Free cancellation up to ${f.cancellationHours} hours before; later cancellations may be charged.`);
    if (f.depositRequired !== null) lines.push(f.depositRequired ? 'A deposit is required to confirm a booking. The amount is not set: never quote one; say the shop will confirm the amount.' : 'No deposit is needed to book.');
  }
  return lines;
}

export interface SetupItem { key: string; label: string; done: boolean; hint: string }

/** The required setup, item by item. The assistant stays off until every item is done. */
export function setupItems(f: SetupFacts): SetupItem[] {
  const week = weeklyHours(f.businessHours);
  const hoursDone = week ? DAYS.every((d) => week[d] !== undefined) : !!f.businessHours && typeof f.businessHours === 'object' && Object.keys(f.businessHours as object).length > 0;
  const methods = methodsOf(f);
  const bankOk = !methods.includes('bank_transfer') || (filled(f.bankName) && filled(f.bankAccountNumber) && filled(f.bankAccountName));
  const payDone = f.payMethods.length > 0 ? methods.length > 0 && bankOk : filled(f.paymentInfo);
  const goods = sellsGoods(f.kind);
  const ful = f.fulfilment;
  // Delivery needs areas with fees. Pickup, or customers coming to us, needs an address. (A service business that visits customers
  // may have no fixed areas, so it only needs them if it chose to list some.)
  const needsAreas = sellsGoods(f.kind) && (ful === 'delivery' || ful === 'both');
  const needsAddress = ful === 'pickup' || ful === 'onsite' || ful === 'both';
  // Businesses set up before these questions existed keep working: having delivery areas counts as having answered.
  const fulDone = ful ? (!needsAreas || f.zones > 0) && (!needsAddress || filled(f.address)) : f.zones > 0;
  const retDone = f.returnType ? f.returnType === 'none' || (f.returnDays ?? 0) >= 1 : filled(f.returnPolicy);
  const items: SetupItem[] = [
    { key: 'products', label: goods ? 'Products and prices' : 'Services and prices', done: f.products > 0, hint: 'Add at least one item with a price.' },
    { key: 'hours', label: 'Opening hours', done: hoursDone, hint: 'Say when you are open, day by day.' },
    { key: 'payments', label: 'How customers pay', done: payDone, hint: 'Pick the ways you accept payment. For bank transfer, add the account details.' },
    { key: 'fulfilment', label: goods ? 'Delivery or pickup' : 'Where the service happens', done: fulDone, hint: needsAreas && f.zones === 0 && ful ? 'Add at least one area you cover.' : 'Say how customers get their order, and add areas or your address.' },
    { key: 'phone', label: 'Your WhatsApp number', done: /^\d{8,15}$/.test(f.ownerPhone ?? ''), hint: 'So we can alert you when a customer needs you.' },
    { key: 'returns', label: 'Returns and refunds', done: retDone, hint: 'Choose your policy so the assistant never guesses.' }
  ];
  if (sellsServices(f.kind)) {
    items.push({ key: 'booking', label: 'Booking rules', done: f.cancellationHours !== null && f.depositRequired !== null, hint: 'Say how late customers can cancel, and whether you take a deposit.' });
  }
  return items;
}

export const isSetupComplete = (f: SetupFacts) => setupItems(f).every((i) => i.done);
