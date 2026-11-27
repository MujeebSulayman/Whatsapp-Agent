import { Body, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { z } from 'zod';
import { Auth, AuthGuard, type AuthCtx } from '../common/auth.guard.js';
import { Messenger } from '../common/messenger.js';
import { parse } from '../common/validate.js';
import { PRISMA } from '../infra.module.js';

@Controller('conversations')
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(Messenger) private readonly messenger: Messenger
  ) {}

  @Get()
  async list(@Auth() a: AuthCtx, @Query('status') status?: string, @Query('search') search?: string) {
    const st = z.enum(['ai', 'human', 'closed']).safeParse(status);
    const rows = await this.db.conversation.findMany({
      where: {
        businessId: a.businessId,
        ...(st.success ? { status: st.data } : {}),
        ...(search ? { customer: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { waId: { contains: search } }] } } : {})
      },
      include: { customer: { select: { id: true, name: true, waId: true } }, messages: { take: 1, orderBy: { seq: 'desc' }, select: { body: true, direction: true, type: true, createdAt: true, sentBy: true } } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100
    });
    return rows.map(({ messages, ...c }) => ({ ...c, lastMessage: messages[0] ?? null }));
  }

  @Get(':id')
  async get(@Auth() a: AuthCtx, @Param('id') id: string) {
    const c = await this.db.conversation.findFirst({ where: { id, businessId: a.businessId }, include: { customer: true } });
    if (!c) throw new NotFoundException();
    const [messages, orders] = await Promise.all([
      this.db.message.findMany({ where: { conversationId: id, businessId: a.businessId }, orderBy: { seq: 'asc' }, take: 300 }),
      this.db.order.findMany({ where: { businessId: a.businessId, customerId: c.customerId }, orderBy: { createdAt: 'desc' }, take: 5 })
    ]);
    return { conversation: { id: c.id, status: c.status, assignedTo: c.assignedTo, windowExpiresAt: c.windowExpiresAt, lastMessageAt: c.lastMessageAt }, customer: c.customer, messages, orders };
  }

  @Post(':id/takeover')
  @HttpCode(200)
  async takeover(@Auth() a: AuthCtx, @Param('id') id: string) {
    await this.setStatus(a, id, 'human', a.userId);
    return { status: 'human' };
  }

  @Post(':id/handback')
  @HttpCode(200)
  async handback(@Auth() a: AuthCtx, @Param('id') id: string) {
    await this.setStatus(a, id, 'ai', null);
    return { status: 'ai' };
  }

  @Post(':id/close')
  @HttpCode(200)
  async close(@Auth() a: AuthCtx, @Param('id') id: string) {
    await this.setStatus(a, id, 'closed', null);
    return { status: 'closed' };
  }

  /** A human replies from the dashboard. Sending takes the conversation over from the AI. */
  @Post(':id/messages')
  @HttpCode(201)
  async send(@Auth() a: AuthCtx, @Param('id') id: string, @Body() body: unknown) {
    const { body: text } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), body);
    const c = await this.db.conversation.findFirst({ where: { id, businessId: a.businessId }, include: { customer: true } });
    if (!c) throw new NotFoundException();
    // WhatsApp only allows free-form messages within 24h of the customer's last message.
    if (c.windowExpiresAt && c.windowExpiresAt.getTime() < Date.now()) {
      throw new ConflictException('The 24-hour reply window has closed. Use an approved template to re-open the chat.');
    }
    const sent = await this.messenger.send(a.businessId, c.customer.waId, text);
    const [message] = await this.db.$transaction([
      this.db.message.create({
        data: { businessId: a.businessId, conversationId: id, direction: 'outbound', type: 'text', body: text, waMessageId: sent.waId, status: sent.dryRun ? 'dry_run' : 'sent', sentBy: 'human' }
      }),
      this.db.conversation.update({ where: { id }, data: { status: 'human', assignedTo: a.userId, lastMessageAt: new Date() } })
    ]);
    return message;
  }

  private async setStatus(a: AuthCtx, id: string, status: 'ai' | 'human' | 'closed', assignedTo: string | null) {
    const res = await this.db.conversation.updateMany({ where: { id, businessId: a.businessId }, data: { status, assignedTo } });
    if (res.count === 0) throw new NotFoundException();
    await this.db.auditLog.create({ data: { businessId: a.businessId, actor: a.userId, action: `conversation.${status}`, payload: { conversationId: id } } });
  }
}
