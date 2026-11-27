import { BadRequestException } from '@nestjs/common';

interface V { name: string; stockQty?: number }

/**
 * Keeps product stock consistent: either every size/colour has its own number (the product total becomes their sum),
 * or none does. Rejects half-filled lists and duplicate names so the assistant never reads an ambiguous catalogue.
 */
export function normaliseStock<T extends { variants?: V[] | null; stockQty?: number }>(d: T): T {
  const vs = d.variants;
  if (!vs || vs.length === 0) return d;
  const names = vs.map((v) => v.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) throw new BadRequestException('Two sizes or colours have the same name.');
  const withQty = vs.filter((v) => typeof v.stockQty === 'number').length;
  if (withQty !== 0 && withQty !== vs.length) throw new BadRequestException('Give every size or colour its own stock number, or none of them.');
  if (withQty === vs.length) return { ...d, stockQty: vs.reduce((s, v) => s + (v.stockQty ?? 0), 0) };
  return d;
}
