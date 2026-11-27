import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@wa/db';
import { z } from 'zod';
import { Auth, AuthGuard, type AuthCtx } from '../common/auth.guard.js';
import { parse } from '../common/validate.js';
import { EmbeddingService } from '../common/embedding.js';
import { PRISMA } from '../infra.module.js';
import { parseCsv, productsFromCsv } from './csv.js';
import { MediaService } from '../media/media.service.js';
import { WaitlistService } from './waitlist.service.js';
import { normaliseStock } from './stock-input.js';

/** A photo is an uploaded /media/<id> path or an https link. */
const Photo = z.string().max(500).refine((u) => /^\/media\/[a-z0-9]{20,40}$/.test(u) || /^https?:\/\//.test(u), 'Invalid photo');

const ProductInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  priceMinor: z.number().int().min(0).max(2_000_000_000),
  stockQty: z.number().int().min(0).max(1_000_000),
  /** false for services and made-to-order items. Defaults from the business type when omitted. */
  trackStock: z.boolean().optional(),
  /** Name only (all sizes share the stock number), or name + stockQty on EVERY variant (stock is held per size/colour). */
  variants: z.array(z.object({ name: z.string().min(1).max(60), stockQty: z.number().int().min(0).max(1_000_000).optional(), image: Photo.nullish() })).max(30).nullable().optional(),
  /** Owner-written note for sold-out items. The assistant may repeat it, never invent a date. */
  restockNote: z.string().trim().max(120).nullable().optional(),
  allowPreorder: z.boolean().optional(),
  imageUrls: z.array(Photo).max(8).optional(),
  active: z.boolean().optional()
});
const ZoneInput = z.object({ areaName: z.string().min(2).max(80), feeMinor: z.number().int().min(0).max(100_000_000), etaText: z.string().min(1).max(60) });
const FaqInput = z.object({ question: z.string().min(3).max(200), answer: z.string().min(1).max(1000) });

@Controller()
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(EmbeddingService) private readonly embeddings: EmbeddingService,
    @Inject(WaitlistService) private readonly waitlist: WaitlistService,
    @Inject(MediaService) private readonly media: MediaService
  ) {}

  private photosOf(d: { imageUrls?: string[]; variants?: { image?: string | null }[] | null }): string[] {
    return [...(d.imageUrls ?? []), ...((d.variants ?? []).map((v) => v.image).filter((x): x is string => !!x))];
  }
  private async checkPhotos(businessId: string, d: { imageUrls?: string[]; variants?: { image?: string | null }[] | null }) {
    if (!(await this.media.ownsAll(businessId, this.photosOf(d)))) throw new BadRequestException('One of the photos is not yours.');
  }

  /** Services never run out of stock; goods do. A mixed business tracks stock unless told otherwise. */
  private async defaultTrackStock(businessId: string): Promise<boolean> {
    const b = await this.db.business.findUniqueOrThrow({ where: { id: businessId }, select: { kind: true } });
    return b.kind !== 'services';
  }

  // ---- products
  @Get('products')
  products(@Auth() a: AuthCtx, @Query('search') search?: string) {
    return this.db.product.findMany({
      where: { businessId: a.businessId, ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) },
      
      orderBy: { name: 'asc' },
      take: 500
    });
  }

  @Post('products')
  @HttpCode(201)
  async createProduct(@Auth() a: AuthCtx, @Body() body: unknown) {
    const d = normaliseStock(parse(ProductInput, body));
    await this.checkPhotos(a.businessId, d);
    const trackStock = d.trackStock ?? (await this.defaultTrackStock(a.businessId));
    const created = await this.db.product.create({
      data: { businessId: a.businessId, ...d, trackStock, variants: (d.variants ?? undefined) as Prisma.InputJsonValue | undefined, description: d.description ?? null }
    });
    this.embeddings.indexProducts(a.businessId, [created.id]);
    return created;
  }

  @Patch('products/:id')
  async updateProduct(@Auth() a: AuthCtx, @Param('id') id: string, @Body() body: unknown) {
    const d = normaliseStock(parse(ProductInput.partial(), body));
    await this.checkPhotos(a.businessId, d);
    const before = await this.db.product.findFirst({ where: { id, businessId: a.businessId }, select: { imageUrls: true, variants: true } });
    const res = await this.db.product.updateMany({ where: { id, businessId: a.businessId }, data: { ...d, variants: (d.variants ?? undefined) as Prisma.InputJsonValue | undefined } });
    if (res.count === 0) throw new NotFoundException();
    this.embeddings.indexProducts(a.businessId, [id]);
    const product = await this.db.product.findFirstOrThrow({ where: { id, businessId: a.businessId } });
    if (before) await this.media.removeUnused(a.businessId, this.photosOf({ imageUrls: before.imageUrls, variants: before.variants as { image?: string | null }[] | null }), this.photosOf({ imageUrls: product.imageUrls, variants: product.variants as { image?: string | null }[] | null }));
    // How many waiting customers can now be told (the dashboard offers to message them).
    return { ...product, waitingNow: await this.waitlist.notifiableCount(a.businessId, id) };
  }

  @Delete('products/:id')
  @HttpCode(204)
  async deleteProduct(@Auth() a: AuthCtx, @Param('id') id: string) {
    const before = await this.db.product.findFirst({ where: { id, businessId: a.businessId }, select: { imageUrls: true, variants: true } });
    const res = await this.db.product.deleteMany({ where: { id, businessId: a.businessId } });
    if (res.count === 0) throw new NotFoundException();
    if (before) await this.media.removeUnused(a.businessId, this.photosOf({ imageUrls: before.imageUrls, variants: before.variants as { image?: string | null }[] | null }), []);
  }

  /** CSV columns: name, description, price (naira), stock, variants (a|b|c). Existing names are updated. */
  @Post('products/import')
  async importProducts(@Auth() a: AuthCtx, @Body() body: unknown) {
    const { csv } = parse(z.object({ csv: z.string().min(1).max(2_000_000) }), body);
    const biz = await this.db.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { currency: true, kind: true } });
    const { rows, errors } = productsFromCsv(parseCsv(csv), biz.currency);
    let created = 0;
    let updated = 0;
    const touched: string[] = [];
    for (const r of rows) {
      const existing = await this.db.product.findFirst({ where: { businessId: a.businessId, name: { equals: r.name, mode: 'insensitive' } } });
      const data = { name: r.name, description: r.description, priceMinor: r.priceMinor, stockQty: r.stockQty, trackStock: biz.kind !== 'services', variants: (r.variants ?? undefined) as Prisma.InputJsonValue | undefined };
      if (existing) {
        await this.db.product.update({ where: { id: existing.id }, data });
        touched.push(existing.id);
        updated++;
      } else {
        touched.push((await this.db.product.create({ data: { businessId: a.businessId, ...data } })).id);
        created++;
      }
    }
    this.embeddings.indexProducts(a.businessId, touched);
    return { created, updated, errors };
  }

  // ---- delivery zones
  @Get('delivery-zones')
  zones(@Auth() a: AuthCtx) {
    return this.db.deliveryZone.findMany({ where: { businessId: a.businessId }, orderBy: { areaName: 'asc' } });
  }
  @Post('delivery-zones')
  @HttpCode(201)
  createZone(@Auth() a: AuthCtx, @Body() body: unknown) {
    return this.db.deliveryZone.create({ data: { businessId: a.businessId, ...parse(ZoneInput, body) } });
  }
  @Patch('delivery-zones/:id')
  async updateZone(@Auth() a: AuthCtx, @Param('id') id: string, @Body() body: unknown) {
    const res = await this.db.deliveryZone.updateMany({ where: { id, businessId: a.businessId }, data: parse(ZoneInput.partial(), body) });
    if (res.count === 0) throw new NotFoundException();
    return this.db.deliveryZone.findFirstOrThrow({ where: { id, businessId: a.businessId } });
  }
  @Delete('delivery-zones/:id')
  @HttpCode(204)
  async deleteZone(@Auth() a: AuthCtx, @Param('id') id: string) {
    if ((await this.db.deliveryZone.deleteMany({ where: { id, businessId: a.businessId } })).count === 0) throw new NotFoundException();
  }

  // ---- FAQs
  @Get('faqs')
  faqs(@Auth() a: AuthCtx) {
    return this.db.faq.findMany({ where: { businessId: a.businessId }, orderBy: { question: 'asc' } });
  }
  @Post('faqs')
  @HttpCode(201)
  createFaq(@Auth() a: AuthCtx, @Body() body: unknown) {
    return this.db.faq.create({ data: { businessId: a.businessId, ...parse(FaqInput, body) } });
  }
  @Patch('faqs/:id')
  async updateFaq(@Auth() a: AuthCtx, @Param('id') id: string, @Body() body: unknown) {
    const res = await this.db.faq.updateMany({ where: { id, businessId: a.businessId }, data: parse(FaqInput.partial(), body) });
    if (res.count === 0) throw new NotFoundException();
    return this.db.faq.findFirstOrThrow({ where: { id, businessId: a.businessId } });
  }
  @Delete('faqs/:id')
  @HttpCode(204)
  async deleteFaq(@Auth() a: AuthCtx, @Param('id') id: string) {
    if ((await this.db.faq.deleteMany({ where: { id, businessId: a.businessId } })).count === 0) throw new NotFoundException();
  }
}
