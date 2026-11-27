import { config } from 'dotenv';
config({ path: '../../.env' }); // backend/.env (cwd is backend/packages/db)
import { createPrisma } from '../src/index.js';
import { encryptSecret } from '@wa/shared';
import { randomBytes, scryptSync } from 'node:crypto';

// Same format as the API's hashPassword (salt:hash, scrypt).
function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`;
}

const prisma = createPrisma();
const naira = (n: number) => n * 100; // kobo

async function main() {
  await prisma.business.deleteMany({ where: { slug: 'lekki-small-chops' } });
  await prisma.user.deleteMany({ where: { email: 'demo@lekkichops.test' } });

  const biz = await prisma.business.create({
    data: {
      name: 'Lekki Small Chops',
      slug: 'lekki-small-chops',
      plan: 'trial',
      trialEndsAt: new Date(Date.now() + 9 * 86_400_000),
      ownerPhone: '2348012345678',
      category: 'small chops delivery',
      city: 'Lekki, Lagos',
      businessHours: { mon_sat: '9am-9pm', sun: '12pm-8pm' },
      paymentInfo: 'Card, bank transfer and USSD via Paystack payment link',
      returnPolicy: 'Food is non-returnable. Contact us within 1 hour if there is a problem with your order.',
      aiRules: {
        create: {
          maxDiscountPct: 5,
          escalateKeywords: ['refund', 'complaint', 'lawyer', 'police', 'food poisoning'],
          forbiddenTopics: ['politics', 'religion'],
          customInstructions: 'Orders need 24 hours notice for party packs. Always confirm the delivery address.'
        }
      },
      products: {
        create: [
          { name: 'Party Pack (serves 10)', description: 'Puff puff, samosa, spring rolls, chicken wings, fish rolls', priceMinor: naira(12000), stockQty: 20 },
          { name: 'Mini Pack (serves 4)', description: 'Puff puff, samosa, spring rolls, chicken wings', priceMinor: naira(5500), stockQty: 30 },
          { name: 'Puff Puff (box of 30)', description: 'Soft, fluffy and freshly fried', priceMinor: naira(2500), stockQty: 50 },
          { name: 'Samosa (box of 20)', description: 'Beef or chicken filling', priceMinor: naira(3000), stockQty: 40, variants: [{ name: 'Beef' }, { name: 'Chicken' }] },
          { name: 'Spring Rolls (box of 20)', description: 'Crispy vegetable and chicken rolls', priceMinor: naira(3000), stockQty: 40 },
          { name: 'Peppered Chicken Wings (12 pcs)', description: 'Spicy grilled wings', priceMinor: naira(4500), stockQty: 25 },
          { name: 'Fish Rolls (box of 15)', description: 'Golden pastry with spiced fish filling', priceMinor: naira(3500), stockQty: 30 },
          { name: 'Chapman (1 litre)', description: 'Classic Nigerian Chapman cocktail (non-alcoholic)', priceMinor: naira(2000), stockQty: 20 }
        ]
      },
      deliveryZones: {
        create: [
          { areaName: 'Lekki Phase 1', feeMinor: naira(2000), etaText: '45-60 minutes' },
          { areaName: 'Lekki Phase 2', feeMinor: naira(2500), etaText: '60 minutes' },
          { areaName: 'Victoria Island', feeMinor: naira(3000), etaText: '60-90 minutes' },
          { areaName: 'Ikoyi', feeMinor: naira(3500), etaText: '75-90 minutes' },
          { areaName: 'Ajah', feeMinor: naira(3500), etaText: '75-90 minutes' }
        ]
      },
      faqs: {
        create: [
          { question: 'What are your opening hours?', answer: 'We take orders Mon-Sat 9am-9pm and Sunday 12pm-8pm.' },
          { question: 'Do you deliver outside Lekki?', answer: 'We deliver to Lekki, Victoria Island, Ikoyi and Ajah. Ask for your area to get the fee.' },
          { question: 'How do I pay?', answer: 'We send a Paystack payment link. You can pay by card, transfer or USSD.' },
          { question: 'Do you do party orders?', answer: 'Yes. Party packs need 24 hours notice.' },
          { question: 'Can I cancel or get a refund?', answer: 'Food is non-returnable. If something is wrong with your order, tell us within 1 hour and the owner will help.' },
          { question: 'Is the food spicy?', answer: 'The chicken wings are peppered. Everything else is mild; ask us if you want it extra mild.' }
        ]
      }
    }
  });
  const key = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  if (key && process.env.SEED_PHONE_NUMBER_ID) {
    await prisma.whatsappAccount.create({
      data: {
        businessId: biz.id,
        wabaId: process.env.SEED_WABA_ID ?? 'seed-waba',
        phoneNumberId: process.env.SEED_PHONE_NUMBER_ID,
        displayNumber: process.env.SEED_DISPLAY_NUMBER ?? 'test',
        accessTokenEncrypted: encryptSecret(process.env.SEED_WHATSAPP_TOKEN ?? 'dev-token', key)
      }
    });
    console.log('Attached WhatsApp account', process.env.SEED_PHONE_NUMBER_ID);
  }

  // ---- Demo login + sample activity so the dashboard has something to show (dev seed only).
  const demoUser = await prisma.user.create({
    data: { email: 'demo@lekkichops.test', name: 'Mujeeb', passwordHash: hashPassword('demo-password-1'), memberships: { create: { businessId: biz.id, role: 'owner' } } }
  });
  const products = await prisma.product.findMany({ where: { businessId: biz.id } });
  const pp = (n: string) => products.find((p) => p.name.startsWith(n))!;
  const mkItem = (name: string, qty: number) => { const p = pp(name); return { product_id: p.id, name: p.name, variant: null, quantity: qty, unit_price_minor: p.priceMinor, line_total_minor: p.priceMinor * qty }; };
  const people = [
    { waId: '2348031112222', name: 'Chioma Okafor' }, { waId: '2348054443333', name: 'Tunde Bakare' }, { waId: '2347065554444', name: 'Amaka Eze' }, { waId: '2349012223333', name: null }
  ];
  const customers = [];
  for (const c of people) customers.push(await prisma.customer.create({ data: { businessId: biz.id, ...c } }));
  const ago = (min: number) => new Date(Date.now() - min * 60_000);
  const chat = async (customerId: string, status: 'ai' | 'human' | 'closed', msgs: [('customer' | 'ai' | 'human'), string, number][]) => {
    const conv = await prisma.conversation.create({ data: { businessId: biz.id, customerId, status, lastMessageAt: ago(msgs[msgs.length - 1]![2]), windowExpiresAt: new Date(Date.now() + 20 * 3600_000), assignedTo: status === 'human' ? demoUser.id : null } });
    for (const [by, body, min] of msgs) {
      await prisma.message.create({ data: { businessId: biz.id, conversationId: conv.id, direction: by === 'customer' ? 'inbound' : 'outbound', body, sentBy: by, status: 'sent', createdAt: ago(min) } });
    }
  };
  await chat(customers[0]!.id, 'ai', [['customer', 'Good evening, how much be party pack?', 42], ['ai', 'Good evening Chioma! The Party Pack (serves 10) is ₦12,000. Na puff puff, samosa, spring rolls, wings and fish rolls. You want make I add am?', 41], ['customer', 'Yes abeg, deliver to Lekki Phase 1', 38], ['ai', 'Delivery to Lekki Phase 1 na ₦2,000 (45-60 minutes). Total na ₦14,000. Wetin be your full address?', 37]]);
  await chat(customers[1]!.id, 'human', [['customer', 'My order came cold and the wings were missing. I want a refund', 190], ['ai', 'Sorry about that, Tunde. I am sending this to the owner now. Someone will reply shortly.', 189], ['human', 'Hi Tunde, this is Mujeeb. So sorry about that, I will send the wings over right away.', 160], ['customer', 'Ok thank you', 150]]);
  await chat(customers[2]!.id, 'closed', [['customer', 'Do you deliver to Ikoyi?', 2900], ['ai', 'Yes! Delivery to Ikoyi is ₦3,500 (75-90 minutes).', 2899], ['customer', 'Thanks', 2890]]);
  await chat(customers[3]!.id, 'ai', [['customer', 'hello', 9]]);
  const mkOrder = (customerId: string, items: ReturnType<typeof mkItem>[], fee: number, status: 'pending' | 'paid' | 'dispatched' | 'delivered' | 'cancelled', pay: 'unpaid' | 'paid', days: number, address: string) => {
    const sub = items.reduce((n, i) => n + i.line_total_minor, 0);
    return prisma.order.create({ data: { businessId: biz.id, customerId, items, subtotalMinor: sub, deliveryFeeMinor: fee, totalMinor: sub + fee, status, paymentStatus: pay, address, createdAt: new Date(Date.now() - days * 86_400_000) } });
  };
  await mkOrder(customers[0]!.id, [mkItem('Party Pack', 1)], naira(2000), 'pending', 'unpaid', 0, '12 Admiralty Way, Lekki Phase 1');
  await mkOrder(customers[1]!.id, [mkItem('Mini Pack', 2), mkItem('Chapman', 1)], naira(2500), 'dispatched', 'paid', 1, '5 Freedom Way, Lekki Phase 2');
  await mkOrder(customers[2]!.id, [mkItem('Puff Puff', 3)], naira(3500), 'delivered', 'paid', 3, '8 Bourdillon Rd, Ikoyi');
  await mkOrder(customers[1]!.id, [mkItem('Party Pack', 2)], naira(2000), 'delivered', 'paid', 6, '5 Freedom Way, Lekki Phase 2');
  await mkOrder(customers[0]!.id, [mkItem('Samosa', 2), mkItem('Peppered', 1)], naira(2000), 'delivered', 'paid', 9, '12 Admiralty Way, Lekki Phase 1');
  await mkOrder(customers[2]!.id, [mkItem('Fish Rolls', 1)], naira(3500), 'cancelled', 'unpaid', 12, '8 Bourdillon Rd, Ikoyi');
  console.log('Demo login: demo@lekkichops.test / demo-password-1');
  console.log(`Seeded business ${biz.name} (${biz.id})`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
