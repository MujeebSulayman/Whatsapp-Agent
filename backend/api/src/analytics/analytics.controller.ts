import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { z } from 'zod';
import { Auth, AuthGuard, type AuthCtx } from '../common/auth.guard.js';
import { PRISMA } from '../infra.module.js';

const Items = z.array(z.object({ name: z.string(), quantity: z.number(), line_total_kobo: z.number() })).catch([]);
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
      this.db.order.findMany({ where: { businessId, createdAt: { gte: since } }, select: { createdAt: true, totalKobo: true, paymentStatus: true, status: true, items: true } }),
      this.db.agentRun.aggregate({ where: { businessId, createdAt: { gte: since } }, _sum: { costUsd: true }, _count: true })
    ]);

    const live = orders.filter((o) => o.status !== 'cancelled');
    const paid = live.filter((o) => o.paymentStatus === 'paid');
    const series = new Map<string, { date: string; orders: number; revenueKobo: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = day(new Date(Date.now() - i * 86_400_000));
      series.set(d, { date: d, orders: 0, revenueKobo: 0 });
    }
    for (const o of live) {
      const p = series.get(day(o.createdAt));
      if (!p) continue;
      p.orders++;
      if (o.paymentStatus === 'paid') p.revenueKobo += o.totalKobo;
    }
    const top = new Map<string, { name: string; quantity: number; revenueKobo: number }>();
    for (const o of live) for (const it of Items.parse(o.items)) {
      const t = top.get(it.name) ?? { name: it.name, quantity: 0, revenueKobo: 0 };
      t.quantity += it.quantity;
      t.revenueKobo += it.line_total_kobo;
      top.set(it.name, t);
    }
    const aiHandled = conversations === 0 ? null : Math.round(((conversations - withHuman.length) / conversations) * 100);
    return {
      days,
      conversations,
      orders: live.length,
      paidOrders: paid.length,
      revenueKobo: paid.reduce((s, o) => s + o.totalKobo, 0),
      conversionPct: conversations === 0 ? null : Math.min(100, Math.round((live.length / conversations) * 100)),
      aiHandledPct: aiHandled,
      aiCostUsd: String(runs._sum.costUsd ?? 0),
      aiRuns: runs._count,
      series: [...series.values()],
      topProducts: [...top.values()].sort((x, y) => y.revenueKobo - x.revenueKobo).slice(0, 5)
    };
  }
}
