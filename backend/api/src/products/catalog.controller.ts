import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@wa/db';
import { z } from 'zod';
import { Auth, AuthGuard, type AuthCtx } from '../common/auth.guard.js';
import { parse } from '../common/validate.js';
import { PRISMA } from '../infra.module.js';
import { parseCsv, productsFromCsv } from './csv.js';

const ProductInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  priceKobo: z.number().int().min(0).max(2_000_000_000),
  stockQty: z.number().int().min(0).max(1_000_000),
  variants: z.array(z.object({ name: z.string().min(1).max(60) })).max(30).nullable().optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(),
  active: z.boolean().optional()
});
const ZoneInput = z.object({ areaName: z.string().min(2).max(80), feeKobo: z.number().int().min(0).max(100_000_000), etaText: z.string().min(1).max(60) });
const FaqInput = z.object({ question: z.string().min(3).max(200), answer: z.string().min(1).max(1000) });

@Controller()
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

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
    const d = parse(ProductInput, body);
    return this.db.product.create({
      data: { businessId: a.businessId, ...d, variants: (d.variants ?? undefined) as Prisma.InputJsonValue | undefined, description: d.description ?? null },
      
    });
  }

  @Patch('products/:id')
  async updateProduct(@Auth() a: AuthCtx, @Param('id') id: string, @Body() body: unknown) {
    const d = parse(ProductInput.partial(), body);
    const res = await this.db.product.updateMany({ where: { id, businessId: a.businessId }, data: { ...d, variants: (d.variants ?? undefined) as Prisma.InputJsonValue | undefined } });
    if (res.count === 0) throw new NotFoundException();
    return this.db.product.findFirstOrThrow({ where: { id, businessId: a.businessId } });
  }

  @Delete('products/:id')
  @HttpCode(204)
  async deleteProduct(@Auth() a: AuthCtx, @Param('id') id: string) {
    const res = await this.db.product.deleteMany({ where: { id, businessId: a.businessId } });
    if (res.count === 0) throw new NotFoundException();
  }

  /** CSV columns: name, description, price (naira), stock, variants (a|b|c). Existing names are updated. */
  @Post('products/import')
  async importProducts(@Auth() a: AuthCtx, @Body() body: unknown) {
    const { csv } = parse(z.object({ csv: z.string().min(1).max(2_000_000) }), body);
    const { rows, errors } = productsFromCsv(parseCsv(csv));
    let created = 0;
    let updated = 0;
    for (const r of rows) {
      const existing = await this.db.product.findFirst({ where: { businessId: a.businessId, name: { equals: r.name, mode: 'insensitive' } } });
      const data = { name: r.name, description: r.description, priceKobo: r.priceKobo, stockQty: r.stockQty, variants: (r.variants ?? undefined) as Prisma.InputJsonValue | undefined };
      if (existing) {
        await this.db.product.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await this.db.product.create({ data: { businessId: a.businessId, ...data } });
        created++;
      }
    }
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
