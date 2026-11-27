import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { decryptSecret } from '@wa/shared';
import { sendText } from '@wa/whatsapp';
import { PRISMA } from '../infra.module.js';

/** Sends WhatsApp messages on behalf of a business (used when a human replies from the dashboard). */
@Injectable()
export class Messenger {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  async send(businessId: string, to: string, body: string): Promise<{ waId: string | null; dryRun: boolean }> {
    const account = await this.db.whatsappAccount.findFirst({ where: { businessId, status: 'active' } });
    if (!account) throw new BadRequestException('Connect a WhatsApp number first (Settings → WhatsApp)');
    if (process.env.WHATSAPP_DRY_RUN === 'true') return { waId: null, dryRun: true };
    const key = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ?? '';
    const accessToken = decryptSecret(account.accessTokenEncrypted, key);
    const waId = await sendText({ phoneNumberId: account.phoneNumberId, accessToken, to, body });
    return { waId, dryRun: false };
  }
}
