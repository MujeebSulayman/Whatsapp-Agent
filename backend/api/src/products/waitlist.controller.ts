import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { availableQty } from '@wa/shared';
import { z } from 'zod';
import { Auth, AuthGuard, type AuthCtx } from '../common/auth.guard.js';
import { Messenger } from '../common/messenger.js';
import { parse } from '../common/validate.js';
import { PRISMA } from '../infra.module.js';
import { WaitlistService } from './waitlist.service.js';

/** Customers waiting for sold-out items. Owners see demand here and tell people when stock is back. */
@Controller('waitlist')
@UseGuards(AuthGuard)
export class WaitlistController {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(Messenger) private readonly messenger: Messenger,
    @Inject(WaitlistService) private readonly waitlist: WaitlistService
  ) {}

  /** Waiting customers grouped by item and size/colour, with whether it can be sent now. */
  @Get()
  async list(@Auth() a: AuthCtx) {
    const entries = await this.db.waitlistEntry.findMany({
      where: { businessId: a.businessId, status: 'waiting' },
      orderBy: { createdAt: 'asc' },
      include: { product: true, customer: { select: { id: true, name: true, waId: true } } },
      take: 1000
    });
    const groups = new Map<string, { productId: string; name: string; variant: string | null; inStock: boolean; people: { id: string; name: string | null; waId: string; since: Date }[] }>();
    for (const e of entries) {
      const key = `${e.productId}::${e.variant ?? ''}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { productId: e.productId, name: e.product.name, variant: e.variant, inStock: (availableQty(e.product, e.variant) ?? 1) > 0, people: [] }));
      g.people.push({ id: e.id, name: e.customer.name, waId: e.customer.waId, since: e.createdAt });
    }
    return [...groups.values()].sort((x, y) => Number(y.inStock) - Number(x.inStock) || y.people.length - x.people.length);
  }

  /**
   * Tell waiting customers the item is back. Free-form WhatsApp messages only work within 24h of the customer's last message,
   * so people outside that window are left on the list and counted, never messaged.
   */
  @Post('notify')
  @HttpCode(200)
  async notify(@Auth() a: AuthCtx, @Body() body: unknown) {
    const { productId, variant } = parse(z.object({ productId: z.string(), variant: z.string().nullable().optional() }), body);
    const product = await this.db.product.findFirst({ where: { id: productId, businessId: a.businessId } });
    if (!product) throw new NotFoundException();
    const ready = await this.waitlist.notifiable(a.businessId, productId, variant);
    let notified = 0;
    let outsideWindow = 0;
    for (const e of ready) {
      const conv = await this.db.conversation.findFirst({ where: { businessId: a.businessId, customerId: e.customerId }, orderBy: { lastMessageAt: 'desc' } });
      if (!conv || !conv.windowExpiresAt || conv.windowExpiresAt.getTime() < Date.now()) { outsideWindow++; continue; }
      const text = `Good news! ${product.name}${e.variant ? ` (${e.variant})` : ''} is back in stock. Reply here if you'd like one and I'll set it up for you.`;
      const sent = await this.messenger.send(a.businessId, e.customer.waId, text);
      await this.db.$transaction([
        this.db.message.create({ data: { businessId: a.businessId, conversationId: conv.id, direction: 'outbound', type: 'text', body: text, waMessageId: sent.waId, status: sent.dryRun ? 'dry_run' : 'sent', sentBy: 'ai' } }),
        this.db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } }),
        this.db.waitlistEntry.update({ where: { id: e.id }, data: { status: 'notified', notifiedAt: new Date() } })
      ]);
      notified++;
    }
    await this.db.auditLog.create({ data: { businessId: a.businessId, actor: a.userId, action: 'waitlist.notify', payload: { productId, variant: variant ?? null, notified, outsideWindow } } });
    return { notified, outsideWindow };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Auth() a: AuthCtx, @Param('id') id: string) {
    const res = await this.db.waitlistEntry.updateMany({ where: { id, businessId: a.businessId, status: 'waiting' }, data: { status: 'cancelled' } });
    if (res.count === 0) throw new NotFoundException();
  }
}
