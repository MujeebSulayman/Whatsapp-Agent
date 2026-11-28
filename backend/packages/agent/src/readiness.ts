import type { PrismaClient } from '@wa/db';
import { setupItems, type SetupFacts, type SetupItem } from '@wa/shared';

/** The parts of a business the setup rules look at. */
export interface BusinessSetupRow {
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
  noticeHours: number | null;
  cancellationHours: number | null;
  depositRequired: boolean | null;
  minOrderMinor: number | null;
  paystackSubaccountCode: string | null;
}

export function factsFrom(b: BusinessSetupRow, counts: { products: number; zones: number }): SetupFacts {
  return { ...b, cardLinkReady: !!b.paystackSubaccountCode && b.currency === 'NGN', products: counts.products, zones: counts.zones };
}

/** Is this business's required setup finished? Used to decide whether the assistant may talk to customers. */
export async function computeReadiness(db: PrismaClient, businessId: string): Promise<{ complete: boolean; items: SetupItem[]; missing: SetupItem[] }> {
  const [b, products, zones] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: businessId } }),
    db.product.count({ where: { businessId, active: true, priceMinor: { gt: 0 } } }),
    db.deliveryZone.count({ where: { businessId } })
  ]);
  const items = setupItems(factsFrom(b as unknown as BusinessSetupRow, { products, zones }));
  const missing = items.filter((i) => !i.done);
  return { complete: missing.length === 0, items, missing };
}
