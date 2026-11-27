import { randomBytes } from 'node:crypto';
import { Body, ConflictException, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { Auth, AuthGuard, type AuthCtx } from '../common/auth.guard.js';
import { hashPassword, signToken, verifyPassword } from '../common/security.js';
import { parse } from '../common/validate.js';
import { PRISMA, REDIS } from '../infra.module.js';

const Signup = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(100),
  businessName: z.string().min(2).max(100),
  category: z.string().min(2).max(60).default('retail'),
  city: z.string().min(2).max(60).default('Lagos')
});
const Login = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'business';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  /** Self-serve: every signup creates a brand new, isolated business with a 14-day trial. */
  @Post('signup')
  @HttpCode(201)
  async signup(@Body() body: unknown) {
    const input = parse(Signup, body);
    const email = input.email.toLowerCase();
    if (await this.db.user.findUnique({ where: { email } })) throw new ConflictException('An account with this email already exists');
    const passwordHash = await hashPassword(input.password);
    const slug = `${slugify(input.businessName)}-${randomBytes(2).toString('hex')}`;
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 3600 * 1000);

    const { user, business } = await this.db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name: input.name, passwordHash } });
      const business = await tx.business.create({
        data: {
          name: input.businessName, slug, category: input.category, city: input.city, trialEndsAt, plan: 'trial',
          aiRules: { create: { maxDiscountPct: 0, escalateKeywords: ['refund', 'complaint', 'lawyer', 'police'], forbiddenTopics: [] } },
          memberships: { create: { userId: user.id, role: 'owner' } }
        }
      });
      return { user, business };
    });
    return { token: await signToken(user.id, business.id), user: { id: user.id, email, name: user.name }, business: { id: business.id, name: business.name } };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: { ip?: string }) {
    const input = parse(Login, body);
    const email = input.email.toLowerCase();
    // 10 attempts / 15 min per ip+email: slows password guessing without locking real users out for long.
    const key = `rl:login:${req.ip ?? 'ip'}:${email}`;
    const attempts = await this.redis.incr(key);
    if (attempts === 1) await this.redis.expire(key, 900);
    if (attempts > 10) throw new HttpException('Too many attempts. Try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);

    const user = await this.db.user.findUnique({ where: { email } });
    const ok = await verifyPassword(input.password, user?.passwordHash ?? null);
    if (!user || !ok) throw new UnauthorizedException('Wrong email or password');
    const membership = await this.db.membership.findFirst({ where: { userId: user.id }, orderBy: { role: 'asc' }, include: { business: true } });
    if (!membership) throw new UnauthorizedException('This account has no business');
    await this.redis.del(key);
    return { token: await signToken(user.id, membership.businessId), user: { id: user.id, email, name: user.name }, business: { id: membership.business.id, name: membership.business.name } };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Auth() auth: AuthCtx) {
    const [user, business] = await Promise.all([
      this.db.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { id: true, email: true, name: true } }),
      this.db.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { id: true, name: true, slug: true, plan: true, trialEndsAt: true } })
    ]);
    return { user, business, role: auth.role };
  }
}
