import { config } from 'dotenv';
config({ path: new URL('../../../.env', import.meta.url).pathname });
import { createPrisma } from '@wa/db';

const db = createPrisma();
await db.business.deleteMany({ where: { slug: 'groc-test' } });
const items: [string, number][] = [['Butter', 3500], ['Cornflakes', 5000], ['Eggs', 6500], ['Flour', 8500], ['Fresh Tomatoes', 15000], ['Frozen Chicken', 8000], ['Frozen Turkey', 10000], ['Garri', 18000], ['Golden Morn', 4000], ['Groundnut Oil', 18000], ['Indomie', 12000], ['Milk', 4500], ['Milo', 5500], ['Onions', 2500], ['Palm Oil', 14000], ['Pepper', 3500], ['Plantain', 5000], ['Potatoes', 8000], ['Rice', 85000], ['Salt', 1500], ['Semovita', 12500], ['Spaghetti', 22000], ['Stockfish', 12000], ['Sugar', 9000], ['Titus Fish', 6000], ['Tomato Paste', 18000], ['Vegetable Oil', 15000]];
const b = await db.business.create({
  data: {
    name: 'Grocery Test', slug: 'groc-test', category: 'Spa', kind: 'both', city: 'Lagos', country: 'NG', currency: 'NGN',
    products: { create: items.map(([name, p]) => ({ name, priceMinor: p * 100, stockQty: 0, trackStock: false })) },
    deliveryZones: { create: [{ areaName: 'Lekki', feeMinor: 200000, etaText: '1 hour' }, { areaName: 'Ikeja', feeMinor: 250000, etaText: '2 hours' }] }
  }
});
console.log('created', b.id);
await db.$disconnect();
