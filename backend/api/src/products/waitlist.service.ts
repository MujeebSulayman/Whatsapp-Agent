import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { availableQty } from '@wa/shared';
import { PRISMA } from '../infra.module.js';

@Injectable()
export class WaitlistService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  /** Waiting entries for a product whose item (or size/colour) has stock again. */
  async notifiable(businessId: string, productId: string, variant?: string | null) {
    const p = await this.db.product.findFirst({ where: { id: productId, businessId, active: true } });
    if (!p) return [];
    const entries = await this.db.waitlistEntry.findMany({
      where: { businessId, productId, status: 'waiting', ...(variant !== undefined ? { variant } : {}) },
      orderBy: { createdAt: 'asc' },
      include: { customer: { select: { id: true, name: true, waId: true } } }
    });
    return entries.filter((e) => (availableQty(p, e.variant) ?? 1) > 0);
  }

  async notifiableCount(businessId: string, productId: string): Promise<number> {
    return (await this.notifiable(businessId, productId)).length;
  }
}
