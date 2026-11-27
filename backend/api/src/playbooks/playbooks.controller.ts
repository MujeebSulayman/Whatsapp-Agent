import { Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@wa/db';
import { PlaybookInput, parseSteps, withStepIds } from '@wa/shared';
import { Auth, AuthGuard, requireOwner, type AuthCtx } from '../common/auth.guard.js';
import { parse } from '../common/validate.js';
import { PRISMA } from '../infra.module.js';

const MAX_PLAYBOOKS = 10;

/** The owner's step-by-step ways of handling customers, and the answers customers have given. */
@Controller('playbooks')
@UseGuards(AuthGuard)
export class PlaybooksController {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  @Get()
  async list(@Auth() a: AuthCtx) {
    const rows = await this.db.playbook.findMany({ where: { businessId: a.businessId }, orderBy: { createdAt: 'asc' }, include: { _count: { select: { runs: true } } } });
    return rows.map(({ _count, ...p }) => ({ ...p, steps: parseSteps(p.steps), runs: _count.runs }));
  }

  /** Customers who have gone through a playbook, newest first, with their answers matched to the questions. */
  @Get('responses')
  async responses(@Auth() a: AuthCtx, @Query('status') status?: string) {
    const rows = await this.db.playbookRun.findMany({
      where: { businessId: a.businessId, ...(status === 'completed' || status === 'active' ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { playbook: true, customer: { select: { id: true, name: true, waId: true } } }
    });
    return rows.map((r) => {
      const answers = (r.answers ?? {}) as Record<string, string>;
      return {
        id: r.id, status: r.status, createdAt: r.createdAt, completedAt: r.completedAt, conversationId: r.conversationId,
        playbook: { id: r.playbookId, name: r.playbook.name }, customer: r.customer,
        answers: parseSteps(r.playbook.steps).map((s) => ({ ask: s.ask, answer: answers[s.id] ?? null }))
      };
    });
  }

  @Post()
  @HttpCode(201)
  async create(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    const d = parse(PlaybookInput, body);
    if ((await this.db.playbook.count({ where: { businessId: a.businessId } })) >= MAX_PLAYBOOKS) throw new ConflictException(`You can have up to ${MAX_PLAYBOOKS} playbooks. Remove one first.`);
    const p = await this.db.playbook.create({
      data: { businessId: a.businessId, name: d.name, whenToUse: d.whenToUse, steps: withStepIds(d.steps) as unknown as Prisma.InputJsonValue, finish: d.finish, finishMessage: d.finishMessage || null, active: d.active ?? true }
    });
    return { ...p, steps: parseSteps(p.steps) };
  }

  @Patch(':id')
  async update(@Auth() a: AuthCtx, @Param('id') id: string, @Body() body: unknown) {
    requireOwner(a);
    const d = parse(PlaybookInput.partial(), body);
    const data: Prisma.PlaybookUpdateManyMutationInput = {
      ...(d.name !== undefined ? { name: d.name } : {}), ...(d.whenToUse !== undefined ? { whenToUse: d.whenToUse } : {}),
      ...(d.steps ? { steps: withStepIds(d.steps) as unknown as Prisma.InputJsonValue } : {}), ...(d.finish ? { finish: d.finish } : {}),
      ...(d.finishMessage !== undefined ? { finishMessage: d.finishMessage || null } : {}), ...(d.active !== undefined ? { active: d.active } : {})
    };
    const res = await this.db.playbook.updateMany({ where: { id, businessId: a.businessId }, data });
    if (res.count === 0) throw new NotFoundException();
    const p = await this.db.playbook.findFirstOrThrow({ where: { id, businessId: a.businessId } });
    return { ...p, steps: parseSteps(p.steps) };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Auth() a: AuthCtx, @Param('id') id: string) {
    requireOwner(a);
    const res = await this.db.playbook.deleteMany({ where: { id, businessId: a.businessId } });
    if (res.count === 0) throw new NotFoundException();
  }
}
