import { BadRequestException, ConflictException, Controller, Delete, Get, HttpCode, Inject, Patch, Put, Body, UseGuards } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { encryptSecret, isCountryCode, isCurrencyCode, isTimezone, maskPhone } from '@wa/shared';
import { z } from 'zod';
import { Auth, AuthGuard, requireOwner, type AuthCtx } from '../common/auth.guard.js';
import { parse } from '../common/validate.js';
import { PRISMA } from '../infra.module.js';

const UpdateBusiness = z.object({
  name: z.string().min(2).max(100),
  category: z.string().trim().min(2).max(60),
  kind: z.enum(['goods', 'services', 'both']),
  city: z.string().min(2).max(60),
  country: z.string().refine(isCountryCode, "Choose a valid country"),
  currency: z.string().refine(isCurrencyCode, "Choose a valid currency"),
  timezone: z.string().refine(isTimezone, "Invalid timezone"),
  tone: z.string().min(2).max(40),
  aiEnabled: z.boolean(),
  businessHours: z.record(z.string(), z.string().max(60)).nullable(),
  paymentInfo: z.string().max(300).nullable(),
  returnPolicy: z.string().max(500).nullable(),
  ownerPhone: z.string().regex(/^\d{8,15}$/, 'Digits only, with country code').nullable()
}).partial();

const AiRules = z.object({
  maxDiscountPct: z.number().int().min(0).max(50),
  escalateKeywords: z.array(z.string().min(1).max(40)).max(30),
  forbiddenTopics: z.array(z.string().min(1).max(40)).max(30),
  customInstructions: z.string().max(1500).nullable()
});

const ConnectWhatsapp = z.object({
  wabaId: z.string().min(3).max(40),
  phoneNumberId: z.string().min(3).max(40),
  displayNumber: z.string().min(5).max(20),
  accessToken: z.string().min(10).max(1000)
});

const monthKey = () => new Date().toISOString().slice(0, 7);

@Controller('business')
@UseGuards(AuthGuard)
export class BusinessController {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  @Get()
  async get(@Auth() auth: AuthCtx) {
    const b = await this.db.business.findUniqueOrThrow({
      where: { id: auth.businessId },
      include: { aiRules: true, whatsappAccounts: { select: { id: true, displayNumber: true, phoneNumberId: true, status: true, wabaId: true } } }
    });
    const usage = await this.db.usageLedger.findUnique({ where: { businessId_period: { businessId: auth.businessId, period: monthKey() } } });
    const [products, zones, faqs] = await Promise.all([
      this.db.product.count({ where: { businessId: auth.businessId, active: true } }),
      this.db.deliveryZone.count({ where: { businessId: auth.businessId } }),
      this.db.faq.count({ where: { businessId: auth.businessId } })
    ]);
    const trialDaysLeft = b.trialEndsAt ? Math.max(0, Math.ceil((b.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null;
    return {
      ...b,
      aiDailyCapUsd: String(b.aiDailyCapUsd),
      trialDaysLeft,
      usage: { period: monthKey(), aiReplies: usage?.aiReplies ?? 0, waMessagesBilled: usage?.waMessagesBilled ?? 0 },
      setup: { whatsapp: b.whatsappAccounts.length > 0, products: products > 0, zones: zones > 0, faqs: faqs > 0 }
    };
  }

  @Patch()
  async update(@Auth() auth: AuthCtx, @Body() body: unknown) {
    requireOwner(auth);
    const data = parse(UpdateBusiness, body);
    if (data.currency) {
      // Amounts are stored in minor units of the business currency, so it can only change while nothing is priced yet.
      const current = await this.db.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { currency: true } });
      if (data.currency !== current.currency) {
        const where = { businessId: auth.businessId };
        const [p, z, o] = await Promise.all([this.db.product.count({ where }), this.db.deliveryZone.count({ where }), this.db.order.count({ where })]);
        if (p + z + o > 0) throw new ConflictException("The currency can't be changed once you have products, delivery fees or orders. Contact support if you need this.");
      }
    }
    const { businessHours, ...rest } = data;
    const updated = await this.db.business.update({
      where: { id: auth.businessId },
      data: { ...rest, ...(businessHours !== undefined ? { businessHours: businessHours ?? undefined } : {}) }
    });
    await this.db.auditLog.create({ data: { businessId: auth.businessId, actor: auth.userId, action: 'settings.update', payload: { fields: Object.keys(data) } } });
    return { id: updated.id };
  }

  @Put('ai-rules')
  async setRules(@Auth() auth: AuthCtx, @Body() body: unknown) {
    requireOwner(auth);
    const data = parse(AiRules, body);
    const rules = await this.db.aiRules.upsert({
      where: { businessId: auth.businessId },
      create: { businessId: auth.businessId, ...data },
      update: data
    });
    await this.db.auditLog.create({ data: { businessId: auth.businessId, actor: auth.userId, action: 'ai_rules.update', payload: { maxDiscountPct: data.maxDiscountPct } } });
    return rules;
  }

  /** Manual connect (Embedded Signup replaces this once the Meta Tech Provider app is approved). */
  @Put('whatsapp')
  async connect(@Auth() auth: AuthCtx, @Body() body: unknown) {
    requireOwner(auth);
    const input = parse(ConnectWhatsapp, body);
    const key = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
    if (!key) throw new BadRequestException('Server is missing WHATSAPP_TOKEN_ENCRYPTION_KEY');
    // One phone_number_id maps to exactly one business across the whole platform.
    const existing = await this.db.whatsappAccount.findUnique({ where: { phoneNumberId: input.phoneNumberId } });
    if (existing && existing.businessId !== auth.businessId) throw new ConflictException('That number is already connected to another account');
    const data = { wabaId: input.wabaId, displayNumber: input.displayNumber, accessTokenEncrypted: encryptSecret(input.accessToken, key), status: 'active' };
    await this.db.whatsappAccount.deleteMany({ where: { businessId: auth.businessId, NOT: { phoneNumberId: input.phoneNumberId } } });
    await this.db.whatsappAccount.upsert({
      where: { phoneNumberId: input.phoneNumberId },
      create: { businessId: auth.businessId, phoneNumberId: input.phoneNumberId, ...data },
      update: data
    });
    await this.db.auditLog.create({ data: { businessId: auth.businessId, actor: auth.userId, action: 'whatsapp.connect', payload: { number: maskPhone(input.displayNumber) } } });
    return { connected: true, displayNumber: input.displayNumber };
  }

  @Delete('whatsapp')
  @HttpCode(204)
  async disconnect(@Auth() auth: AuthCtx) {
    requireOwner(auth);
    await this.db.whatsappAccount.deleteMany({ where: { businessId: auth.businessId } });
    await this.db.auditLog.create({ data: { businessId: auth.businessId, actor: auth.userId, action: 'whatsapp.disconnect' } });
  }

  /** NDPA: export everything we hold for this business. */
  @Get('export')
  async export(@Auth() auth: AuthCtx) {
    requireOwner(auth);
    const where = { businessId: auth.businessId };
    const [business, products, faqs, zones, customers, conversations, messages, orders] = await Promise.all([
      this.db.business.findUniqueOrThrow({ where: { id: auth.businessId }, include: { aiRules: true } }),
      this.db.product.findMany({ where }),
      this.db.faq.findMany({ where }),
      this.db.deliveryZone.findMany({ where }),
      this.db.customer.findMany({ where }),
      this.db.conversation.findMany({ where }),
      this.db.message.findMany({ where }),
      this.db.order.findMany({ where })
    ]);
    return { exportedAt: new Date().toISOString(), business, products, faqs, deliveryZones: zones, customers, conversations, messages, orders };
  }

  /** NDPA: permanently delete the business and everything under it. Requires typing the slug. */
  @Delete()
  @HttpCode(204)
  async remove(@Auth() auth: AuthCtx, @Body() body: unknown) {
    requireOwner(auth);
    const { confirm } = parse(z.object({ confirm: z.string() }), body);
    const b = await this.db.business.findUniqueOrThrow({ where: { id: auth.businessId } });
    if (confirm !== b.slug) throw new BadRequestException('Type the business slug to confirm');
    const members = await this.db.membership.findMany({ where: { businessId: b.id }, select: { userId: true } });
    await this.db.$transaction(async (tx) => {
      await tx.business.delete({ where: { id: b.id } }); // cascades to all tenant tables
      for (const m of members) {
        if ((await tx.membership.count({ where: { userId: m.userId } })) === 0) await tx.user.delete({ where: { id: m.userId } });
      }
    });
  }
}
