import { Controller, Get, Headers, HttpCode, Inject, Logger, Post, Query, Req, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { verifyMetaSignature } from '@wa/whatsapp';
import { WhatsappService } from './whatsapp.service.js';

interface RawBodyRequest {
  rawBody?: Buffer;
  body: unknown;
}

@Controller('webhooks/whatsapp')
export class WhatsappController {
  private readonly log = new Logger('WhatsappWebhook');
  constructor(@Inject(WhatsappService) private readonly service: WhatsappService) {}

  /** Meta's one-time subscription handshake. */
  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string
  ): string {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (mode === 'subscribe' && expected && token === expected && challenge) return challenge;
    throw new ForbiddenException();
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest, @Headers('x-hub-signature-256') signature?: string): Promise<{ ok: true }> {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret || !req.rawBody || !verifyMetaSignature(req.rawBody, signature, secret)) {
      throw new UnauthorizedException();
    }
    try {
      const accepted = await this.service.handlePayload(req.body);
      this.log.log(`accepted ${accepted} message(s)`);
    } catch (err) {
      // Never make Meta retry-storm us over our own bug: log and still return 200.
      this.log.error(`failed to process webhook: ${(err as Error).message}`);
    }
    return { ok: true };
  }
}
