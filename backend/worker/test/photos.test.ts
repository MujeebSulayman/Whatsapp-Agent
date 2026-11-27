import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url).pathname });
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '@wa/db';
import { buildSystemPrompt, searchProducts, sendProductImage } from '@wa/agent';
import type { ToolContext } from '@wa/agent';

const prisma = createPrisma();
const sent: { url: string; caption?: string }[] = [];
let biz: { id: string; cust: string; tee: string; plain: string };
const ctx = (): ToolContext => ({ db: prisma, businessId: biz.id, currency: 'NGN', kind: 'goods', conversationId: 'c', customerId: biz.cust, state: { handedOff: false }, sendImage: async (o) => { sent.push(o); } });

beforeAll(async () => {
  process.env.API_PUBLIC_URL = 'https://api.example.com';
  await prisma.business.deleteMany({ where: { slug: 'ph-shop' } });
  const b = await prisma.business.create({
    data: {
      name: 'Photo Shop', slug: 'ph-shop', category: 'Fashion', kind: 'goods', city: 'Lagos', country: 'NG', currency: 'NGN',
      customers: { create: [{ waId: `234${Math.floor(Math.random() * 1e9)}` }] },
      products: {
        create: [
          { name: 'Logo Tee', priceMinor: 500000, stockQty: 5, imageUrls: ['/media/aaaaaaaaaaaaaaaaaaaa1', '/media/bbbbbbbbbbbbbbbbbbbb2', 'https://cdn.example.com/c.jpg', '/media/dddddddddddddddddddd4'], variants: [{ name: 'Red', image: '/media/redredredredredredred' }, { name: 'Blue' }] },
          { name: 'Plain Cap', priceMinor: 200000, stockQty: 5 }
        ]
      }
    },
    include: { products: true, customers: true }
  });
  biz = { id: b.id, cust: b.customers[0]!.id, tee: b.products.find((p) => p.name === 'Logo Tee')!.id, plain: b.products.find((p) => p.name === 'Plain Cap')!.id };
});
afterAll(async () => { await prisma.business.deleteMany({ where: { slug: 'ph-shop' } }); await prisma.$disconnect(); });

describe('sending product photos', () => {
  it('sends the photo of the colour asked for first, with public links, at most three, caption on the first', async () => {
    sent.length = 0;
    const r = await sendProductImage.run(ctx(), { product_id: biz.tee, variant: 'red' });
    expect(r).toMatchObject({ sent: true, photos: 3 });
    expect(sent.map((s) => s.url)).toEqual(['https://api.example.com/media/redredredredredredred', 'https://api.example.com/media/aaaaaaaaaaaaaaaaaaaa1', 'https://api.example.com/media/bbbbbbbbbbbbbbbbbbbb2']);
    expect(sent[0]!.caption).toBe('Logo Tee (Red) - ₦5,000');
    expect(sent[1]!.caption).toBeUndefined();
  });

  it('says so when the colour has no photo of its own, instead of implying it does', async () => {
    sent.length = 0;
    const r = (await sendProductImage.run(ctx(), { product_id: biz.tee, variant: 'Blue' })) as { note?: string };
    expect(r.note).toMatch(/no photo of Blue/);
  });

  it('does not promise a photo that does not exist, and search says how many photos there are', async () => {
    sent.length = 0;
    expect(await sendProductImage.run(ctx(), { product_id: biz.plain })).toMatchObject({ sent: false, note: expect.stringMatching(/no photo/) });
    expect(sent).toHaveLength(0);
    const s = (await searchProducts.run(ctx(), { query: 'Cap' })) as { results: { photos: number }[] };
    expect(s.results[0]!.photos).toBe(0);
  });

  it('cannot send photos of another business’s product', async () => {
    const other = await prisma.product.findFirst({ where: { businessId: { not: biz.id } } });
    if (other) expect(await sendProductImage.run(ctx(), { product_id: other.id })).toMatchObject({ error: expect.any(String) });
  });

  it('the assistant is told when to send photos and not to promise them', () => {
    const p = buildSystemPrompt({ businessName: 'X', category: 'c', city: '', country: 'Nigeria', currency: 'NGN', kind: 'goods', maxDiscountPct: 0, hours: '', paymentMethods: '', returnPolicy: '', customInstructions: '', tone: 'friendly', forbiddenTopics: [], faqs: [] });
    expect(p).toMatch(/call send_product_image/);
    expect(p).toMatch(/never promise a photo/);
  });
});
