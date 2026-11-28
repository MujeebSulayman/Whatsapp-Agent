import { createOpenRouterEmbedder, embeddingModelFromEnv } from '@wa/ai';
import { productsMissingEmbedding, setProductEmbedding, type PrismaClient } from '@wa/db';

/**
 * Three different test businesses for the evals, created on demand (safe to run again). They are kept apart from the demo shop so
 * scenarios can cover goods with and without stock, services, sizes, sold-out items, pre-orders and playbooks.
 */
export type Shop = 'demo' | 'grocery' | 'spa' | 'shoes';
export const SLUGS: Record<Shop, string> = { demo: 'lekki-small-chops', grocery: 'eval-grocery', spa: 'eval-spa', shoes: 'eval-shoes' };

const N = (naira: number) => naira * 100;
type P = { name: string; priceMinor: number; description?: string; stockQty?: number; trackStock?: boolean; variants?: object[]; restockNote?: string; allowPreorder?: boolean; imageUrls?: string[] };
const free = (name: string, naira: number, description?: string): P => ({ name, priceMinor: N(naira), trackStock: false, stockQty: 0, ...(description ? { description } : {}) });

const grocery: P[] = [
  free('Butter (250g)', 3500), free('Cornflakes (500g)', 5000), { name: 'Eggs (Crate)', priceMinor: N(6500), trackStock: true, stockQty: 3 }, free('Flour (5kg)', 8500), free('Fresh Tomatoes (Basket)', 15000),
  free('Frozen Chicken (1kg)', 8000), free('Frozen Turkey (1kg)', 10000), free('Garri (10kg)', 18000), free('Golden Morn (500g)', 4000), free('Groundnut Oil (5L)', 18000),
  free('Indomie (Carton)', 12000), { name: 'Milk (Tin)', priceMinor: N(4500), trackStock: true, stockQty: 0, restockNote: 'Back next Friday' }, free('Milo (500g)', 5500), free('Onions (1kg)', 2500),
  free('Palm Oil (5L)', 14000), free('Pepper (1kg)', 3500), free('Plantain (Bunch)', 5000), free('Potatoes (5kg)', 8000), { name: 'Rice (50kg)', priceMinor: N(85000), trackStock: true, stockQty: 2 },
  free('Salt (1kg)', 1500), free('Semovita (5kg)', 12500), free('Spaghetti (Carton)', 22000), free('Stockfish (1kg)', 12000), free('Sugar (5kg)', 9000), free('Titus Fish (1kg)', 6000),
  free('Tomato Paste (Carton)', 18000), free('Vegetable Oil (5L)', 15000), free('Beans (25kg)', 48000)
];

const spa: P[] = [
  free('Full body massage', 25000, '60 minutes, Swedish massage with warm oils'), free('Facial', 18000, 'Deep cleansing facial, 45 minutes'), free('Manicure', 8000, 'Classic manicure'),
  free('Pedicure', 9000, 'Classic pedicure'), free('Hot stone therapy', 30000, '75 minutes with heated basalt stones'), free('Couples package', 50000, 'Two massages and a facial each, for two people')
];

const shoes: P[] = [
  { name: 'Air Runner Sneaker', priceMinor: N(45000), description: 'Lightweight running shoe', trackStock: true, stockQty: 5, variants: [{ name: '42', stockQty: 3 }, { name: '43', stockQty: 0 }, { name: '44', stockQty: 2 }] },
  { name: 'Classic Leather Loafer', priceMinor: N(38000), description: 'Handmade leather loafer', trackStock: true, stockQty: 6, variants: [{ name: '42', stockQty: 4 }, { name: '43', stockQty: 2 }] },
  { name: 'Beach Sandal', priceMinor: N(12000), trackStock: true, stockQty: 0, restockNote: 'Back around 20 Dec' },
  { name: 'Limited Jacket', priceMinor: N(90000), trackStock: true, stockQty: 0, allowPreorder: true, restockNote: 'Second batch ships in January' },
  { name: 'Phone Case', priceMinor: N(3500), trackStock: false, stockQty: 0, imageUrls: ['https://images.example.com/phone-case.jpg'] }
];

interface Def { name: string; slug: string; category: string; kind: 'goods' | 'services'; city: string; hours: object; payment: string; returns: string; tone: string; products: P[]; zones: [string, number, string][]; faqs: [string, string][]; maxDiscount: number; escalate: string[]; instructions: string | null }
const defs: Record<Exclude<Shop, 'demo'>, Def> = {
  grocery: {
    name: 'Mama Bola Foods', slug: SLUGS.grocery, category: 'Groceries', kind: 'goods', city: 'Lagos', tone: 'friendly',
    hours: { 'Mon-Sat': '8am-8pm', Sunday: 'closed' }, payment: 'Bank transfer to GTBank 0123456789 (Mama Bola Foods). The shop confirms once it arrives.', returns: 'Report any problem within 24 hours of delivery.',
    products: grocery, zones: [['Lekki', 2000, '1 hour'], ['Ikeja', 2500, '2 hours'], ['Yaba', 3000, '2 hours']], maxDiscount: 5, escalate: ['refund', 'complaint', 'lawyer', 'NAFDAC'], instructions: 'Orders above ₦100,000 need 24 hours notice.',
    faqs: [['Where is your shop?', 'We are at 12 Allen Avenue, Ikeja, Lagos.'], ['Do you deliver on Sundays?', 'No, we are closed on Sundays.']]
  },
  spa: {
    name: 'Serenity Spa', slug: SLUGS.spa, category: 'Beauty & wellness', kind: 'services', city: 'Lagos', tone: 'professional',
    hours: { 'Tue-Sun': '10am-7pm', Monday: 'closed' }, payment: 'Pay by bank transfer or card at the spa after your session.', returns: 'If you are not happy with a treatment, tell us the same day and we will make it right.',
    products: spa, zones: [['Lekki', 3000, 'we come to you'], ['Victoria Island', 4000, 'we come to you']], maxDiscount: 0, escalate: ['refund', 'complaint', 'pregnant'], instructions: 'We cancel free of charge with 24 hours notice. Never give medical advice.',
    faqs: [['Where is the spa?', 'Serenity Spa, 4 Admiralty Way, Lekki Phase 1.'], ['Do you take walk-ins?', 'We prefer bookings, but walk-ins are welcome when a therapist is free.']]
  },
  shoes: {
    name: 'Urban Sole', slug: SLUGS.shoes, category: 'Fashion', kind: 'goods', city: 'Lagos', tone: 'friendly',
    hours: { 'Mon-Sat': '9am-7pm' }, payment: 'Bank transfer to Access Bank 0987654321 (Urban Sole).', returns: 'Exchanges within 7 days if unworn and in the box.',
    products: shoes, zones: [['Ikeja', 3000, '1-2 days'], ['Yaba', 3500, '1-2 days']], maxDiscount: 5, escalate: ['refund', 'complaint', 'fake'], instructions: null,
    faqs: [['Are your shoes original?', 'Yes, all our shoes are original and come in the box.']]
  }
};

async function indexMissing(db: PrismaClient) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return;
  const embedder = createOpenRouterEmbedder({ apiKey, model: embeddingModelFromEnv() });
  for (;;) {
    const batch = (await productsMissingEmbedding(db)).slice(0, 50);
    if (batch.length === 0) break;
    const vectors = await embedder.embed(batch.map((p) => [p.name, p.description].filter(Boolean).join('. ')));
    for (const [i, p] of batch.entries()) await setProductEmbedding(db, p.businessId, p.id, vectors[i]!);
  }
}

export async function ensureFixtures(db: PrismaClient): Promise<void> {
  for (const d of Object.values(defs)) {
    if (await db.business.findUnique({ where: { slug: d.slug } })) continue;
    const b = await db.business.create({
      data: {
        name: d.name, slug: d.slug, category: d.category, kind: d.kind, city: d.city, country: 'NG', currency: 'NGN', tone: d.tone, businessHours: d.hours, paymentInfo: d.payment, returnPolicy: d.returns, ownerPhone: '2348000000000', ...(d.kind === 'services' ? { cancellationHours: 24, depositRequired: false } : {}),
        aiRules: { create: { maxDiscountPct: d.maxDiscount, escalateKeywords: d.escalate, forbiddenTopics: [], customInstructions: d.instructions } },
        products: { create: d.products.map((p) => ({ ...p, variants: p.variants as never })) },
        deliveryZones: { create: d.zones.map(([areaName, fee, etaText]) => ({ areaName, feeMinor: N(fee), etaText })) },
        faqs: { create: d.faqs.map(([question, answer]) => ({ question, answer })) }
      }
    });
    if (d.slug === SLUGS.spa) {
      await db.playbook.create({
        data: {
          businessId: b.id, name: 'Booking enquiry', whenToUse: 'A customer wants to book or asks how to book a treatment',
          steps: [{ id: 's1', ask: 'Which treatment do they want?', required: true }, { id: 's2', ask: 'What day and time suit them?', required: true }, { id: 's3', ask: 'Do they want to come to the spa or have us visit them (and where)?', required: true }],
          finish: 'handoff', finishMessage: 'Thank you! Our team will confirm your booking shortly.'
        }
      });
    }
  }
  await indexMissing(db);
}
