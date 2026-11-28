import { describe, expect, it } from 'vitest';
import { moneyIn, ungroundedAmounts, unknownNames } from '@wa/agent';

const none: { content: string | null }[] = [];
const bad = (reply: string, history = none, tools: unknown[] = []) => ungroundedAmounts(reply, history, tools);

describe('amounts: every way money gets written', () => {
  it('sees money written with symbols, codes, words, shorthand and plain numbers', () => {
    const cases: [string, number][] = [
      ['It is ₦12,000.', 12000], ['It is ₦12000.', 12000], ['It is N12,000', 12000], ['N12k only', 12000], ['about 12k', 12000], ['2.5k', 2500],
      ['12,000 NGN', 12000], ['5000 naira', 5000], ['KSh 1,500', 1500], ['USD 20', 20], ['20 dollars', 20], ['$20', 20], ['€15.50', 15.5], ['£8', 8], ['R200', 200],
      ['GH₵ 45', 45], ['costs 12000', 12000], ['the total 48500', 48500], ['₦1.5m', 1500000], ['Rs 300', 300]
    ];
    for (const [text, value] of cases) expect(moneyIn(text).map((m) => m.value), text).toContain(value);
  });

  it('does not mistake other numbers for money', () => {
    for (const t of ['Delivery takes 45-60 minutes.', 'We open at 9am and close at 8pm.', '12 Admiralty Way, Lekki', 'Call 0801 234 5678', 'Size 42, serves 10',
      'a 5% discount', 'the 50kg bag', '24 hours notice', 'since 2026', 'for 2026', 'order #K7T2Q4', 'in 3 days', '2 packs', 'about 15 pieces', 'a 250g tin']) {
      expect(moneyIn(t), t).toEqual([]);
    }
  });
});

describe('amounts: only ones the assistant was actually given', () => {
  const tool = [{ results: [{ name: 'Party Pack', price: '₦12,000' }], fee: '₦2,000' }];

  it('accepts the same amount however it is written', () => {
    for (const r of ['₦12,000', '₦12000', 'N12,000', '12k', 'N12k', '12000 naira', '12,000 NGN', 'costs 12000']) expect(bad(`Party Pack ${r}`, none, tool), r).toEqual([]);
    expect(bad('Delivery is 2k', none, tool)).toEqual([]);
  });

  it('flags made-up or self-calculated amounts in any format', () => {
    for (const r of ['₦30,000', '30k', 'N30k', '30000 naira', 'costs 30000', 'USD 30', '$30', 'KSh 3,000']) expect(bad(`Swift Step is ${r}`, none, tool), r).not.toEqual([]);
    expect(bad('Your total is 14k', none, tool)).toEqual(['14k']); // the model's own sum, not a price a tool returned
  });

  it('accepts amounts the customer said, including their shorthand', () => {
    expect(bad('Anything under ₦20,000 is fine.', [{ content: 'my budget is 20k' }], [])).toEqual([]);
    expect(bad('For 20k I would suggest ...', [{ content: 'my budget is ₦20,000' }], [])).toEqual([]);
  });

  it('works for other currencies the same way', () => {
    const kes = [{ price: 'KSh 1,500' }];
    expect(bad('That is KSh 1,500.', none, kes)).toEqual([]);
    expect(bad('That is 1500 KES.', none, kes)).toEqual([]);
    expect(bad('That is KSh 1,800.', none, kes)).not.toEqual([]);
    const eur = [{ price: '€1.500,00' }];
    expect(bad('Das kostet €1.500,00.', none, eur)).toEqual([]);
  });
});

describe('product names the assistant was never given', () => {
  const sources = ['You are the sales assistant for Urban Sole, a Fashion business in Lagos, Nigeria. FAQ: We deliver to Victoria Island and Lekki Phase 1.',
    JSON.stringify({ results: [{ name: 'Air Runner Sneaker', price: '₦45,000' }, { name: 'Classic Leather Loafer' }] }), 'do you have sneakers in 43?'];

  it('flags a name that appears from nowhere', () => {
    expect(unknownNames('We also have the Swift Step Sneakers for you.', sources)).toEqual(['Swift Step Sneakers']);
    expect(unknownNames('Try our Comfort Plus Slides!', sources)).toEqual(['Comfort Plus Slides']);
  });

  it('accepts real products (plural or singular), the business name, areas, and everyday politeness', () => {
    for (const t of ['The Air Runner Sneakers are in stock.', 'We have the Classic Leather Loafer.', 'Welcome to Urban Sole!', 'We deliver to Victoria Island.', 'Good Afternoon! Thank You for waiting.',
      'Lekki Phase 1 costs the same.', 'Good Evening and welcome.', 'Sorry about that, I will check with the team.']) {
      expect(unknownNames(t, sources), t).toEqual([]);
    }
  });
});
