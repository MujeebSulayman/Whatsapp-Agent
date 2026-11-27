export type Kind = 'goods' | 'services' | 'both';

export interface Category {
  name: string;
  kind: Kind;
}

/**
 * A short list of broad categories (the examples in brackets help owners recognise theirs).
 * It is only a starting point: anyone can choose "Other" and type their own, and the category is just a label.
 * The `kind` is what drives behaviour: stocked products, services (quotes and bookings), or both.
 */
export const CATEGORIES: Category[] = [
  { name: 'Food & drink', kind: 'goods' },
  { name: 'Fashion & accessories', kind: 'goods' },
  { name: 'Beauty & personal care', kind: 'both' },
  { name: 'Electronics & gadgets', kind: 'goods' },
  { name: 'Home & general retail', kind: 'goods' },
  { name: 'Home services (HVAC, plumbing, painting…)', kind: 'services' },
  { name: 'Auto & transport', kind: 'both' },
  { name: 'Health & wellness', kind: 'services' },
  { name: 'Professional services', kind: 'services' },
  { name: 'Events, travel & hospitality', kind: 'services' },
  { name: 'Education & training', kind: 'services' }
];

export const CUSTOM_CATEGORY = '__custom__';

/** Suggested business type for a category name (case-insensitive); undefined for a custom category. */
export const kindFor = (category: string): Kind | undefined => CATEGORIES.find((c) => c.name.toLowerCase() === category.trim().toLowerCase())?.kind;

export const KIND_OPTIONS: { value: Kind; label: string; hint: string }[] = [
  { value: 'goods', label: 'Products', hint: 'You sell items from stock and deliver or hand them over.' },
  { value: 'services', label: 'Services', hint: 'You quote or book jobs and visits (no stock).' },
  { value: 'both', label: 'Products and services', hint: 'You do both.' }
];
