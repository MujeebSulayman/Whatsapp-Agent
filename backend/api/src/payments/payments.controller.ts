import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { PAYMENT_CURRENCIES } from '@wa/agent';
import type { PrismaClient } from '@wa/db';
import { PaystackError, type PaystackClient, type PaystackBank } from '@wa/shared';
import { z } from 'zod';
import { Auth, AuthGuard, requireOwner, type AuthCtx } from '../common/auth.guard.js';
import { parse } from '../common/validate.js';
import { PRISMA } from '../infra.module.js';

export const PAYSTACK_CLIENT = 'PAYSTACK_CLIENT';
const Account = z.object({ bankCode: z.string().regex(/^[0-9A-Za-z-]{2,12}$/), accountNumber: z.string().regex(/^\d{10}$/, 'A Nigerian account number has 10 digits') });

/** Setting up where a business receives its online payments (its own bank account, as a Paystack subaccount). */
@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  private banks: { at: number; list: PaystackBank[] } | null = null;
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(PAYSTACK_CLIENT) private readonly paystack: PaystackClient | null
  ) {}

  private client(): PaystackClient {
    if (!this.paystack) throw new ServiceUnavailableException('Online payments are not switched on for this service yet.');
    return this.paystack;
  }
  private fail(e: unknown): never {
    if (e instanceof PaystackError && e.status >= 400 && e.status < 500) throw new BadRequestException(e.message);
    throw new ServiceUnavailableException('The payment provider could not be reached. Please try again.');
  }

  @Get('status')
  async status(@Auth() a: AuthCtx) {
    const b = await this.db.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { currency: true, paystackSubaccountCode: true, payoutBankName: true, payoutAccountName: true, payoutAccountLast4: true } });
    return {
      available: !!this.paystack,
      supported: PAYMENT_CURRENCIES.includes(b.currency),
      currency: b.currency,
      connected: !!b.paystackSubaccountCode,
      bankName: b.payoutBankName, accountName: b.payoutAccountName, last4: b.payoutAccountLast4
    };
  }

  @Get('banks')
  async listBanks() {
    const client = this.client();
    if (this.banks && Date.now() - this.banks.at < 3_600_000) return this.banks.list;
    try {
      const list = (await client.listBanks('nigeria')).sort((x, y) => x.name.localeCompare(y.name));
      this.banks = { at: Date.now(), list };
      return list;
    } catch (e) { return this.fail(e); }
  }

  /** Look up the name on an account so the owner can confirm it is theirs before anything is saved. */
  @Post('resolve-account')
  @HttpCode(200)
  async resolve(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    const d = parse(Account, body);
    try { return await this.client().resolveAccount(d.accountNumber, d.bankCode); } catch (e) { return this.fail(e); }
  }

  @Post('payout-account')
  @HttpCode(200)
  async connect(@Auth() a: AuthCtx, @Body() body: unknown) {
    requireOwner(a);
    const d = parse(Account, body);
    const b = await this.db.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { name: true, currency: true } });
    if (!PAYMENT_CURRENCIES.includes(b.currency)) throw new BadRequestException('Online payments are only available for businesses paid in Nigerian naira for now.');
    const client = this.client();
    try {
      const [{ accountName }, banks] = await Promise.all([client.resolveAccount(d.accountNumber, d.bankCode), this.listBanks()]);
      const percentage = Math.min(100, Math.max(0, Number(process.env.PLATFORM_FEE_PCT ?? 0)));
      const { subaccountCode } = await client.createSubaccount({ businessName: b.name, bankCode: d.bankCode, accountNumber: d.accountNumber, percentageCharge: percentage });
      const bankName = banks.find((x) => x.code === d.bankCode)?.name ?? null;
      await this.db.business.update({ where: { id: a.businessId }, data: { paystackSubaccountCode: subaccountCode, payoutBankName: bankName, payoutAccountName: accountName, payoutAccountLast4: d.accountNumber.slice(-4) } });
      await this.db.auditLog.create({ data: { businessId: a.businessId, actor: a.userId, action: 'payments.connect', payload: { bank: bankName, last4: d.accountNumber.slice(-4) } } });
      return { connected: true, bankName, accountName, last4: d.accountNumber.slice(-4) };
    } catch (e) { return this.fail(e); }
  }

  /** Stop taking online payments. Customers are given the owner's manual payment details instead. */
  @Delete('payout-account')
  @HttpCode(204)
  async disconnect(@Auth() a: AuthCtx) {
    requireOwner(a);
    await this.db.business.update({ where: { id: a.businessId }, data: { paystackSubaccountCode: null, payoutBankName: null, payoutAccountName: null, payoutAccountLast4: null } });
    await this.db.auditLog.create({ data: { businessId: a.businessId, actor: a.userId, action: 'payments.disconnect', payload: {} } });
  }
}
