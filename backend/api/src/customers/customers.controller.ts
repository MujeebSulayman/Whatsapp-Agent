import { Body, Controller, Get, Inject, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { z } from 'zod';
import { Auth, AuthGuard, type AuthCtx } from '../common/auth.guard.js';
import { parse } from '../common/validate.js';
import { PRISMA } from '../infra.module.js';

@Controller('customers')
@UseGuards(AuthGuard)
export class CustomersController {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  @Get()
  list(@Auth() a: AuthCtx, @Query('search') search?: string) {
    return this.db.customer.findMany({
      where: { businessId: a.businessId, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { waId: { contains: search } }] } : {}) },
      include: { _count: { select: { orders: true } } },
      orderBy: { lastOrderAt: { sort: 'desc', nulls: 'last' } },
      take: 300
    });
  }

  @Get(':id')
  async get(@Auth() a: AuthCtx, @Param('id') id: string) {
    const c = await this.db.customer.findFirst({
      where: { id, businessId: a.businessId },
      include: { orders: { orderBy: { createdAt: 'desc' }, take: 50 }, conversations: { orderBy: { lastMessageAt: 'desc' }, take: 5, select: { id: true, status: true, lastMessageAt: true } } }
    });
    if (!c) throw new NotFoundException();
    return c;
  }

  @Patch(':id')
  async update(@Auth() a: AuthCtx, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(z.object({ name: z.string().max(100).nullable(), notes: z.string().max(1000).nullable(), tags: z.array(z.string().max(30)).max(20), optedInMarketing: z.boolean() }).partial(), body);
    if ((await this.db.customer.updateMany({ where: { id, businessId: a.businessId }, data: d })).count === 0) throw new NotFoundException();
    return this.db.customer.findFirstOrThrow({ where: { id, businessId: a.businessId } });
  }
}
