import 'dotenv/config';
import { createPrisma } from '../src/index.js';

const prisma = createPrisma();
const naira = (n: number) => n * 100; // kobo

async function main() {
  await prisma.business.deleteMany({ where: { slug: 'lekki-small-chops' } });

  const biz = await prisma.business.create({
    data: {
      name: 'Lekki Small Chops',
      slug: 'lekki-small-chops',
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
          { name: 'Party Pack (serves 10)', description: 'Puff puff, samosa, spring rolls, chicken wings, fish rolls', priceKobo: naira(12000), stockQty: 20 },
          { name: 'Mini Pack (serves 4)', description: 'Puff puff, samosa, spring rolls, chicken wings', priceKobo: naira(5500), stockQty: 30 },
          { name: 'Puff Puff (box of 30)', description: 'Soft, fluffy and freshly fried', priceKobo: naira(2500), stockQty: 50 },
          { name: 'Samosa (box of 20)', description: 'Beef or chicken filling', priceKobo: naira(3000), stockQty: 40, variants: [{ name: 'Beef' }, { name: 'Chicken' }] },
          { name: 'Spring Rolls (box of 20)', description: 'Crispy vegetable and chicken rolls', priceKobo: naira(3000), stockQty: 40 },
          { name: 'Peppered Chicken Wings (12 pcs)', description: 'Spicy grilled wings', priceKobo: naira(4500), stockQty: 25 },
          { name: 'Fish Rolls (box of 15)', description: 'Golden pastry with spiced fish filling', priceKobo: naira(3500), stockQty: 30 },
          { name: 'Chapman (1 litre)', description: 'Classic Nigerian Chapman cocktail (non-alcoholic)', priceKobo: naira(2000), stockQty: 20 }
        ]
      },
      deliveryZones: {
        create: [
          { areaName: 'Lekki Phase 1', feeKobo: naira(2000), etaText: '45-60 minutes' },
          { areaName: 'Lekki Phase 2', feeKobo: naira(2500), etaText: '60 minutes' },
          { areaName: 'Victoria Island', feeKobo: naira(3000), etaText: '60-90 minutes' },
          { areaName: 'Ikoyi', feeKobo: naira(3500), etaText: '75-90 minutes' },
          { areaName: 'Ajah', feeKobo: naira(3500), etaText: '75-90 minutes' }
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
  console.log(`Seeded business ${biz.name} (${biz.id})`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
