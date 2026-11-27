import type { PrismaClient } from './generated/client.js';

/**
 * Tenant-scoped repository layer. All app code reads/writes business data through
 * scoped(prisma, businessId) so a query can never leak across businesses.
 */
export function scoped(db: PrismaClient, businessId: string) {
  return {
    businessId,
    products: {
      list: () => db.product.findMany({ where: { businessId, active: true }, orderBy: { name: 'asc' } }),
      get: (id: string) => db.product.findFirst({ where: { id, businessId } })
    },
    deliveryZones: { list: () => db.deliveryZone.findMany({ where: { businessId } }) },
    faqs: { list: () => db.faq.findMany({ where: { businessId } }) },
    customers: {
      get: (id: string) => db.customer.findFirst({ where: { id, businessId } }),
      byWaId: (waId: string) => db.customer.findUnique({ where: { businessId_waId: { businessId, waId } } })
    },
    orders: {
      get: (id: string) => db.order.findFirst({ where: { id, businessId } }),
      list: () => db.order.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' } })
    },
    conversations: {
      get: (id: string) => db.conversation.findFirst({ where: { id, businessId } }),
      list: () => db.conversation.findMany({ where: { businessId }, orderBy: { lastMessageAt: 'desc' } })
    }
  };
}
