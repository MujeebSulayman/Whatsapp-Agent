import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { defaultCurrencyFor, isCountryCode, isCurrencyCode, isTimezone } from '@wa/shared';
import { z } from 'zod';
import { signToken } from '../common/security.js';
import { PRISMA } from '../infra.module.js';

/** What we need to know about a new business (the same for email and Google sign-up). */
export const BusinessProfile = z.object({
  businessName: z.string().min(2).max(100),
  category: z.string().trim().min(2).max(60),
  kind: z.enum(['goods', 'services', 'both']).default('goods'),
  city: z.string().min(2).max(60),
  country: z.string().refine(isCountryCode, 'Choose a valid country'),
  /** Optional: normally derived from the country (US -> USD). */
  currency: z.string().refine(isCurrencyCode, 'Choose a valid currency').optional(),
  timezone: z.string().refine(isTimezone, 'Invalid timezone').default('UTC')
});
export type BusinessProfile = z.infer<typeof BusinessProfile>;

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'business';

@Injectable()
export class AccountsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  /** Self-serve: every new account gets a brand new, isolated business on a 14-day trial. */
  async create(input: { email: string; name: string; passwordHash: string | null; identity?: { provider: string; subject: string }; profile: BusinessProfile }) {
    const currency = input.profile.currency ?? defaultCurrencyFor(input.profile.country);
    if (!currency) throw new BadRequestException('We could not work out a currency for that country');
    const email = input.email.toLowerCase();
    if (await this.db.user.findUnique({ where: { email } })) throw new ConflictException('An account with this email already exists');
    const slug = `${slugify(input.profile.businessName)}-${randomBytes(2).toString('hex')}`;
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 3600 * 1000);

    const { user, business } = await this.db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name: input.name, passwordHash: input.passwordHash, ...(input.identity ? { identities: { create: { ...input.identity, email } } } : {}) }
      });
      const business = await tx.business.create({
        data: {
          name: input.profile.businessName, slug, category: input.profile.category, kind: input.profile.kind, city: input.profile.city,
          country: input.profile.country, currency, timezone: input.profile.timezone, trialEndsAt, plan: 'trial',
          aiRules: { create: { maxDiscountPct: 0, escalateKeywords: ['refund', 'money back', 'complaint', 'lawyer', 'police', 'scam', 'fraud', 'wrong item', 'damaged', 'missing', 'charged twice'], forbiddenTopics: [] } },
          memberships: { create: { userId: user.id, role: 'owner' } }
        }
      });
      return { user, business };
    });
    return {
      token: await signToken(user.id, business.id),
      user: { id: user.id, email, name: user.name },
      business: { id: business.id, name: business.name, country: business.country, currency: business.currency, kind: business.kind }
    };
  }
}
