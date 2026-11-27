import { Body, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@wa/db';
import { decrementStock } from '@wa/shared';
import { z } from 'zod';
import { Auth, AuthGuard, type AuthCtx } from '../common/auth.guard.js';
import { parse } from '../common/validate.js';
import { PRISMA } from '../infra.module.js';

const OrderItems = z.array(z.object({ product_id: z.string(), quantity: z.number().int(), variant: z.string().nullish(), preorder: z.boolean().optional() })).catch([]);

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  @Get()
  list(@Auth() a: AuthCtx, @Query('status') status?: string, @Query('search') search?: string) {
    const st = z.enum(['pending', 'paid', 'dispatched', 'delivered', 'cancelled']).safeParse(status);
    return this.db.order.findMany({
      where: {
        businessId: a.businessId,
        ...(st.success ? { status: st.data } : {}),
        ...(search ? { OR: [{ id: { contains: search } }, { customer: { name: { contains: search, mode: 'insensitive' } } }, { customer: { waId: { contains: search } } }] } : {})
      },
      include: { customer: { select: { id: true, name: true, waId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
  }

  @Get(':id')
  async get(@Auth() a: AuthCtx, @Param('id') id: string) {
    const o = await this.db.order.findFirst({ where: { id, businessId: a.businessId }, include: { customer: true, payments: true } });
    if (!o) throw new NotFoundException();
    return o;
  }

  @Patch(':id/status')
  async setStatus(@Auth() a: AuthCtx, @Param('id') id: string, @Body() body: unknown) {
    const { status } = parse(z.object({ status: z.enum(['dispatched', 'delivered', 'cancelled']) }), body);
    const o = await this.db.order.findFirst({ where: { id, businessId: a.businessId } });
    if (!o) throw new NotFoundException();
    if (o.status === 'cancelled' || o.status === 'delivered') throw new ConflictException(`Order is already ${o.status}`);
    await this.db.order.update({ where: { id }, data: { status } });
    await this.db.auditLog.create({ data: { businessId: a.businessId, actor: a.userId, action: `order.${status}`, payload: { orderId: id } } });
    return { id, status };
  }

  /** Owner confirms money was received outside the app (e.g. bank transfer). Idempotent. */
  @Post(':id/mark-paid')
  @HttpCode(200)
  async markPaid(@Auth() a: AuthCtx, @Param('id') id: string) {
    const o = await this.db.order.findFirst({ where: { id, businessId: a.businessId } });
    if (!o) throw new NotFoundException();
    if (o.status === 'cancelled') throw new ConflictException('Order is cancelled');
    if (o.paymentStatus === 'paid') return { id, paymentStatus: 'paid' };
    const items = OrderItems.parse(o.items);
    await this.db.$transaction(async (tx) => {
      // Re-check inside the transaction so two clicks can't double-count.
      const claimed = await tx.order.updateMany({
        where: { id, businessId: a.businessId, paymentStatus: { not: 'paid' } },
        data: { paymentStatus: 'paid', ...(o.status === 'pending' ? { status: 'paid' } : {}) }
      });
      if (claimed.count === 0) return;
      for (const it of items) {
        if (it.preorder) continue; // a pre-order has nothing in stock to take yet
        const p = await tx.product.findFirst({ where: { id: it.product_id, businessId: a.businessId } });
        const next = p ? decrementStock(p, it.variant, it.quantity) : null;
        if (!p || !next) continue;
        // Guarded on the value we read, so two simultaneous payments can't both take the last item.
        await tx.product.updateMany({ where: { id: p.id, businessId: a.businessId, stockQty: p.stockQty }, data: { stockQty: next.stockQty, ...(next.variants ? { variants: next.variants as unknown as Prisma.InputJsonValue } : {}) } });
      }
      await tx.customer.updateMany({ where: { id: o.customerId, businessId: a.businessId }, data: { totalSpentMinor: { increment: o.totalMinor }, lastOrderAt: new Date() } });
      await tx.auditLog.create({ data: { businessId: a.businessId, actor: a.userId, action: 'order.mark_paid', payload: { orderId: id, totalMinor: o.totalMinor } } });
    });
    return { id, paymentStatus: 'paid' };
  }
}
