/**
 * Checks that what the assistant says to a customer was actually given to it: by a tool, by the customer, or by the owner's own
 * setup. A price or a product name that appears from nowhere means it made it up.
 */

interface Msg { content: string | null }

const SYMBOLS = '₦$€£¥₹₵₱₩₫₺₴₽฿';
const CODES = 'NGN|USD|GHS|KES|ZAR|EUR|GBP|CFA|XOF|XAF|TZS|UGX|RWF|ETB|EGP|MAD|INR|CAD|AUD|AED|SAR|KSh|TSh|USh|GH₵|Rs';
const WORDS = 'naira|dollars?|cedis?|shillings?|rand|euros?|pounds?|francs?|bucks';
const UNITS = 'kg|g|mg|ml|l|cl|cm|mm|m|km|%|am|pm|hrs?|hours?|mins?|minutes?|days?|weeks?|pieces?|pcs|items?|people|persons?|x';

const n = (raw: string) => Number(raw.replace(/,/g, ''));
const withSuffix = (raw: string, suffix?: string) => (suffix ? n(raw) * (/m/i.test(suffix) ? 1_000_000 : 1000) : n(raw));

/** Every number in a text, including "12k" and "1.5m", as plain numbers. */
function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)(\s?[kKmM]\b)?/g)) {
    const v = withSuffix(m[1]!, m[2]?.trim());
    if (Number.isFinite(v)) out.push(v);
    out.push(n(m[1]!)); // also as written, in case the "k" was part of something else
  }
  return out;
}
const digitsOnly = (v: number) => String(Math.round(v * 100));

/** Amounts in a reply that look like money, however they are written. Returns the number and how it was written. */
export function moneyIn(reply: string): { value: number; text: string }[] {
  const byValue = new Map<number, { value: number; text: string }>();
  const add = (raw: string, suffix: string | undefined, _whole: string) => {
    const value = withSuffix(raw, suffix?.trim());
    // one entry per amount, shown as the customer would read it ("30,000", "30k")
    if (Number.isFinite(value) && value > 0 && !byValue.has(value)) byValue.set(value, { value, text: `${raw}${suffix?.trim() ?? ''}` });
  };
  // currency symbol or code before the number: ₦12,000  N12k  KSh 1,500  USD 20
  const before = new RegExp(`(?:[${SYMBOLS}]|\\bN(?=\\d)|\\bR(?=\\d)|\\b(?:${CODES})\\b\\.?)\\s?(\\d[\\d,]*(?:\\.\\d+)?)(\\s?[kKmM]\\b)?`, 'g');
  for (const m of reply.matchAll(before)) add(m[1]!, m[2], m[0]);
  // currency code or word after the number: 12,000 NGN  5000 naira  20 dollars
  const after = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)(\\s?[kKmM])?\\s?(?:${CODES}|${WORDS})\\b`, 'gi');
  for (const m of reply.matchAll(after)) add(m[1]!, m[2], m[0]);
  // thousands separators: 12,000
  for (const m of reply.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?/g)) add(m[0], undefined, m[0]);
  // shorthand: 12k, 2.5k
  for (const m of reply.matchAll(/\b(\d+(?:\.\d+)?)\s?([kK])\b/g)) add(m[1]!, m[2], m[0]);
  // a plain number straight after a money word: "costs 12000", "total 48500"
  const context = new RegExp(`\\b(?:costs?|priced?|price\\s+is|total|fee|charge[sd]?|pay|only|just|for|at|is|are|from|under|over|around|about)\\s+(\\d{4,}(?:\\.\\d+)?)\\b(?!\\s*(?:${UNITS})\\b)`, 'gi');
  for (const m of reply.matchAll(context)) if (!(n(m[1]!) >= 1900 && n(m[1]!) <= 2100)) add(m[1]!, undefined, m[1]!);
  return [...byValue.values()];
}

/**
 * Amounts in the reply that no tool returned and nobody in the chat mentioned. The assistant may never state a price from memory
 * or guess one, so any such amount means it made it up (or did its own sums).
 */
export function ungroundedAmounts(reply: string, history: Msg[], toolOutputs: unknown[]): string[] {
  const known = new Set<string>();
  for (const text of [...history.map((m) => m.content ?? ''), ...toolOutputs.map((o) => JSON.stringify(o))]) {
    for (const v of numbersIn(text)) known.add(digitsOnly(v));
  }
  const bad = moneyIn(reply).filter((m) => !known.has(digitsOnly(m.value))).map((m) => m.text);
  return [...new Set(bad)];
}

/* ---------------- product names ---------------- */

/** Capitalised phrases that are ordinary politeness, not product names. */
const COMMON = new Set([
  'good morning', 'good afternoon', 'good evening', 'good day', 'good night', 'thank you', 'thanks', 'welcome', 'happy birthday', 'best regards',
  'kind regards', 'many thanks', 'have a great day', 'great day', 'no problem', 'no worries', 'of course', 'you are welcome', 'good news',
  'the team', 'our team', 'good question', 'feel free', 'let me', 'how can', 'would you', 'do you', 'can i'
]);

const wordsIn = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
const stem = (w: string) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');

/**
 * Capitalised multi-word phrases in the reply (like "Swift Step Sneakers") with a word that appears nowhere the assistant was given:
 * not in the catalogue results, the chat, or the business's own setup. Those are invented names.
 * `sources` should include the system prompt (business name, FAQs, owner notes) so real names are not flagged.
 */
export function unknownNames(reply: string, sources: string[]): string[] {
  const known = new Set<string>();
  for (const s of sources) for (const w of wordsIn(s)) { known.add(w); known.add(stem(w)); }
  const bad: string[] = [];
  for (const m of reply.matchAll(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,3}\b/g)) {
    const phrase = m[0];
    if (COMMON.has(phrase.toLowerCase())) continue;
    const words = phrase.toLowerCase().split(/\s+/);
    if (words.every((w) => COMMON.has(w) || known.has(w) || known.has(stem(w)))) continue;
    bad.push(phrase);
  }
  return [...new Set(bad)];
}
