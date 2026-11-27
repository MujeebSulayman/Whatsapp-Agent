import { Body, Controller, Get, Header, HttpCode, Inject, NotFoundException, Param, Post, StreamableFile, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Auth, AuthGuard, type AuthCtx } from '../common/auth.guard.js';
import { parse } from '../common/validate.js';
import { MediaService } from './media.service.js';

@Controller('media')
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  /** Upload one photo (already shrunk by the browser). Returns the path to save on the product. */
  @Post()
  @UseGuards(AuthGuard)
  @HttpCode(201)
  upload(@Auth() a: AuthCtx, @Body() body: unknown) {
    return this.media.save(a.businessId, parse(z.object({ data: z.string().max(700_000) }), body).data);
  }

  /**
   * Public on purpose: WhatsApp fetches product photos from this link, and the dashboard shows them.
   * The id is unguessable and only product photos are stored here.
   */
  @Get(':id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async get(@Param('id') id: string) {
    const m = /^[a-z0-9]{20,40}$/.test(id) ? await this.media.get(id) : null;
    if (!m) throw new NotFoundException();
    return new StreamableFile(Buffer.from(m.bytes), { type: m.mime, disposition: 'inline' });
  }
}
