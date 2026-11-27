import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { z } from 'zod';
import { Auth, AuthGuard, requireOwner, type AuthCtx } from '../common/auth.guard.js';
import { hashPassword } from '../common/security.js';
import { parse } from '../common/validate.js';
import { PRISMA } from '../infra.module.js';

@Controller('team')
@UseGuards(AuthGuard)
export class TeamController {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  @Get()
  async list(@Auth() a: AuthCtx) {
    const rows = await this.db.membership.findMany({ where: { businessId: a.businessId }, include: { user: { select: { id: true, email: true, name: true } } }, orderBy: { role: 'asc' } });
    return rows.map((m) => ({ userId: m.userId, role: m.role, email: m.user.email, name: m.user.name }));
  }

  /** Owner creates an agent login (an emailed invite link replaces this once email sending is set up). */
  @Post()
  @HttpCode(201)
  async add(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    const d = parse(z.object({ email: z.string().email().max(200), name: z.string().min(1).max(100), password: z.string().min(8).max(200) }), body);
    const email = d.email.toLowerCase();
    if (await this.db.user.findUnique({ where: { email } })) throw new ConflictException('That email already has an account');
    const user = await this.db.user.create({ data: { email, name: d.name, passwordHash: await hashPassword(d.password), memberships: { create: { businessId: a.businessId, role: 'agent' } } } });
    await this.db.auditLog.create({ data: { businessId: a.businessId, actor: a.userId, action: 'team.add', payload: { userId: user.id } } });
    return { userId: user.id, email, name: d.name, role: 'agent' };
  }

  @Delete(':userId')
  @HttpCode(204)
  async remove(@Auth() a: AuthCtx, @Param('userId') userId: string) {
    requireOwner(a);
    if (userId === a.userId) throw new BadRequestException("You can't remove yourself");
    const m = await this.db.membership.findUnique({ where: { userId_businessId: { userId, businessId: a.businessId } } });
    if (!m) throw new NotFoundException();
    if (m.role === 'owner') throw new BadRequestException("The owner can't be removed");
    await this.db.$transaction([
      this.db.membership.delete({ where: { id: m.id } }),
      this.db.user.deleteMany({ where: { id: userId, memberships: { none: {} } } })
    ]);
    await this.db.auditLog.create({ data: { businessId: a.businessId, actor: a.userId, action: 'team.remove', payload: { userId } } });
  }
}
