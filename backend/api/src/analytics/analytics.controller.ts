import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { z } from 'zod';
import { Auth, AuthGuard, type AuthCtx } from '../common/auth.guard.js';
import { PRISMA } from '../infra.module.js';

const Items = z.array(z.object({ name: z.string(), quantity: z.number(), line_total_minor: z.number() })).catch([]);
const day = (d: Date) => d.toISOString().slice(0, 10);

@Controller('analytics')
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  @Get('overview')
  async overview(@Auth() a: AuthCtx, @Query('days') daysRaw?: string) {
    const days = Math.min(90, Math.max(7, Number(daysRaw) || 30));
    const since = new Date(Date.now() - days * 86_400_000);
    const businessId = a.businessId;

    const [conversations, withHuman, orders, runs] = await Promise.all([
      this.db.conversation.count({ where: { businessId, lastMessageAt: { gte: since } } }),
      this.db.message.groupBy({ by: ['conversationId'], where: { businessId, sentBy: 'human', createdAt: { gte: since } } }),
      this.db.order.findMany({ where: { businessId, createdAt: { gte: since } }, select: { createdAt: true, totalMinor: true, paymentStatus: true, status: true, items: true } }),
      // Only replies to customers: the owner's own setup help and practice chats are not "AI replies", and what the AI costs us is not shown to businesses.
      this.db.agentRun.count({ where: { businessId, kind: 'chat', createdAt: { gte: since } } })
    ]);

    const live = orders.filter((o) => o.status !== 'cancelled');
    const paid = live.filter((o) => o.paymentStatus === 'paid');
    const series = new Map<string, { date: string; orders: number; revenueMinor: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = day(new Date(Date.now() - i * 86_400_000));
      series.set(d, { date: d, orders: 0, revenueMinor: 0 });
    }
    for (const o of live) {
      const p = series.get(day(o.createdAt));
      if (!p) continue;
      p.orders++;
      if (o.paymentStatus === 'paid') p.revenueMinor += o.totalMinor;
    }
    const top = new Map<string, { name: string; quantity: number; revenueMinor: number }>();
    for (const o of live) for (const it of Items.parse(o.items)) {
      const t = top.get(it.name) ?? { name: it.name, quantity: 0, revenueMinor: 0 };
      t.quantity += it.quantity;
      t.revenueMinor += it.line_total_minor;
      top.set(it.name, t);
    }
    const aiHandled = conversations === 0 ? null : Math.round(((conversations - withHuman.length) / conversations) * 100);
    return {
      days,
      conversations,
      orders: live.length,
      paidOrders: paid.length,
      revenueMinor: paid.reduce((s, o) => s + o.totalMinor, 0),
      conversionPct: conversations === 0 ? null : Math.min(100, Math.round((live.length / conversations) * 100)),
      aiHandledPct: aiHandled,
      aiRuns: runs,
      series: [...series.values()],
      topProducts: [...top.values()].sort((x, y) => y.revenueMinor - x.revenueMinor).slice(0, 5)
    };
  }
}
