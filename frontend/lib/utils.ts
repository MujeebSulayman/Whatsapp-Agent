import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Money is integer kobo everywhere; format at the edge only. */
export const formatNaira = (kobo: number): string =>
  '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });

/** "12,500.50" -> 1250050. Returns null when the text isn't a valid amount. No floating point. */
export function nairaToKobo(input: string): number | null {
  const m = input.replace(/[₦,\s]/g, '').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
}
export const koboToInput = (kobo: number): string => (kobo / 100).toFixed(kobo % 100 === 0 ? 0 : 2);

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const initials = (name?: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
