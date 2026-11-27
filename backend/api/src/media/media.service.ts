import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { PRISMA } from '../infra.module.js';

export const MAX_PHOTO_BYTES = 400_000;
const MAX_PHOTOS_PER_BUSINESS = 500;
const MAX_TOTAL_BYTES = 150_000_000;

/** The type is decided from the file's own first bytes, never from what the browser claims. */
export function sniffImage(b: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export const MEDIA_PATH = /^\/media\/([a-z0-9]{20,40})$/;

/** Where photos live. Today: a database table. Swap the body of these methods for R2/S3 later; callers don't change. */
@Injectable()
export class MediaService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  async save(businessId: string, dataUrl: string): Promise<{ id: string; url: string }> {
    const m = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) throw new BadRequestException('Send a JPEG, PNG or WebP photo.');
    const bytes = Buffer.from(m[1]!, 'base64');
    if (bytes.length > MAX_PHOTO_BYTES) throw new BadRequestException('That photo is too big. Photos are shrunk automatically; try another one.');
    const mime = sniffImage(bytes);
    if (!mime) throw new BadRequestException('That file is not a valid photo.');
    const used = await this.db.media.aggregate({ where: { businessId }, _count: true, _sum: { sizeBytes: true } });
    if (used._count >= MAX_PHOTOS_PER_BUSINESS || (used._sum.sizeBytes ?? 0) + bytes.length > MAX_TOTAL_BYTES) throw new BadRequestException('Photo storage is full. Remove photos you no longer use.');
    const row = await this.db.media.create({ data: { businessId, mime, bytes, sizeBytes: bytes.length }, select: { id: true } });
    return { id: row.id, url: `/media/${row.id}` };
  }

  async get(id: string) {
    return this.db.media.findUnique({ where: { id }, select: { mime: true, bytes: true } });
  }

  /** Drop photos a product no longer uses. Only ever this business's own. */
  async removeUnused(businessId: string, before: string[], after: string[]) {
    const keep = new Set(after);
    const ids = before.filter((u) => !keep.has(u)).map((u) => MEDIA_PATH.exec(u)?.[1]).filter((x): x is string => !!x);
    if (ids.length) await this.db.media.deleteMany({ where: { id: { in: ids }, businessId } });
  }

  /** True when every /media/ path in the list is a photo of this business. External URLs are left alone. */
  async ownsAll(businessId: string, urls: string[]): Promise<boolean> {
    const ids = urls.map((u) => MEDIA_PATH.exec(u)?.[1]).filter((x): x is string => !!x);
    if (!ids.length) return true;
    return (await this.db.media.count({ where: { id: { in: ids }, businessId } })) === new Set(ids).size;
  }
}
