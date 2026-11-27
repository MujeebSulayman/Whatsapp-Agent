import { parseMoney } from '@wa/shared';

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export interface CsvProduct { name: string; description: string | null; priceMinor: number; stockQty: number; variants: { name: string }[] | null }

export function productsFromCsv(rows: string[][], currency: string): { rows: CsvProduct[]; errors: { row: number; message: string }[] } {
  const [header, ...body] = rows;
  const errors: { row: number; message: string }[] = [];
  const out: CsvProduct[] = [];
  if (!header) return { rows: [], errors: [{ row: 1, message: 'File is empty' }] };
  const col = (n: string) => header.findIndex((h) => h.trim().toLowerCase() === n);
  const [iName, iDesc, iPrice, iStock, iVar] = ['name', 'description', 'price', 'stock', 'variants'].map(col) as [number, number, number, number, number];
  if (iName < 0 || iPrice < 0) return { rows: [], errors: [{ row: 1, message: 'Header must include "name" and "price"' }] };
  body.forEach((r, idx) => {
    const line = idx + 2;
    const name = (r[iName] ?? '').trim();
    const priceMinor = parseMoney(r[iPrice] ?? '', currency);
    const stockRaw = iStock >= 0 ? (r[iStock] ?? '').trim() : '0';
    const stock = stockRaw === '' ? 0 : Number(stockRaw);
    if (!name) return void errors.push({ row: line, message: 'Missing name' });
    if (priceMinor === null) return void errors.push({ row: line, message: `Invalid price "${r[iPrice] ?? ''}"` });
    if (!Number.isInteger(stock) || stock < 0) return void errors.push({ row: line, message: `Invalid stock "${stockRaw}"` });
    const variants = iVar >= 0 ? (r[iVar] ?? '').split('|').map((v) => v.trim()).filter(Boolean).map((name) => ({ name })) : [];
    out.push({ name, description: iDesc >= 0 ? (r[iDesc] ?? '').trim() || null : null, priceMinor, stockQty: stock, variants: variants.length ? variants : null });
  });
  return { rows: out, errors };
}
