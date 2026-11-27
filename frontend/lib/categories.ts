export type Kind = 'goods' | 'services' | 'both';

export interface CategoryGroup {
  label: string;
  items: { name: string; kind: Kind }[];
}

const g = (names: string[]) => names.map((name) => ({ name, kind: 'goods' as Kind }));
const s = (names: string[]) => names.map((name) => ({ name, kind: 'services' as Kind }));
const b = (names: string[]) => names.map((name) => ({ name, kind: 'both' as Kind }));

/**
 * Suggested categories. Not a limit: the owner can always type their own, and the category is only a label.
 * The `kind` is what drives behaviour: stocked products, services (quotes and bookings), or both.
 */
export const CATEGORY_GROUPS: CategoryGroup[] = [
  { label: 'Food & drink', items: g(['Restaurant & takeaway', 'Bakery & cakes', 'Catering & small chops', 'Grocery & provisions', 'Drinks & beverages', 'Fresh produce & farm goods']) },
  { label: 'Fashion & accessories', items: [...g(['Clothing & thrift', 'Shoes & bags', 'Jewellery & watches']), ...b(['Tailoring & custom wear'])] },
  { label: 'Beauty & personal care', items: [...g(['Skincare & cosmetics', 'Hair products & wigs']), ...s(['Hair salon & barbershop', 'Makeup & beauty services', 'Spa, massage & nails', 'Fitness & personal training'])] },
  { label: 'Electronics, home & general retail', items: g(['Phones & gadgets', 'Computers & accessories', 'Home appliances', 'Furniture & decor', 'Building materials & hardware', 'Auto parts & accessories', 'Books & stationery', 'Baby & kids', 'Pets & pet supplies', 'Health products & pharmacy']) },
  { label: 'Home services & trades', items: [...s(['HVAC & air conditioning', 'Plumbing', 'Electrical', 'Painting & decorating', 'Cleaning & laundry', 'Pest control', 'Carpentry & furniture repair', 'Roofing & construction', 'Landscaping & gardening', 'Locksmith & security', 'Moving & removals', 'Appliance repair', 'Solar & renewable energy', 'Interior design']), ...b(['Home improvement & fitting'])] },
  { label: 'Automotive', items: s(['Car repair & mechanic', 'Car wash & detailing', 'Car rental & taxi', 'Driving school', 'Towing & roadside help']) },
  { label: 'Health & wellness', items: [...s(['Clinic & dental', 'Physiotherapy', 'Veterinary']), ...b(['Opticians & eye care'])] },
  { label: 'Professional services', items: [...s(['Accounting & tax', 'Legal', 'Real estate & property', 'Consulting & coaching', 'Photography & video', 'IT & web services', 'Translation & writing', 'Insurance & finance', 'Recruitment & HR']), ...b(['Design, print & branding'])] },
  { label: 'Events & travel', items: s(['Event planning & decor', 'DJ, MC & entertainment', 'Venue & equipment hire', 'Hotels & guesthouses', 'Travel agency & tours']) },
  { label: 'Education', items: s(['Tutoring & lessons', 'Training & courses', 'Daycare & childcare']) }
];

export const ALL_CATEGORIES = CATEGORY_GROUPS.flatMap((grp) => grp.items);
export const CUSTOM_CATEGORY = '__custom__';

/** Suggested business type for a category name (case-insensitive); undefined for a custom category. */
export const kindFor = (category: string): Kind | undefined => ALL_CATEGORIES.find((c) => c.name.toLowerCase() === category.trim().toLowerCase())?.kind;

export const KIND_OPTIONS: { value: Kind; label: string; hint: string }[] = [
  { value: 'goods', label: 'Products', hint: 'You sell items from stock and deliver or hand them over.' },
  { value: 'services', label: 'Services', hint: 'You quote or book jobs and visits (no stock).' },
  { value: 'both', label: 'Products and services', hint: 'You do both.' }
];
