import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Postgres cannot store the NUL character (\u0000) in text, so one in a name, a message or a URL would make the database refuse it
 * and the server answer 500. Rejecting it up front gives every route a clean 400 instead. Webhooks are left alone: they carry
 * other people's payloads and handle their own failures.
 */
const MAX_DEPTH = 24;

function hasNul(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes('\u0000');
  if (value === null || typeof value !== 'object') return false;
  if (depth > MAX_DEPTH) throw new BadRequestException('That request is nested too deeply.');
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.includes('\u0000') || hasNul(v, depth + 1)) return true;
  }
  return false;
}

@Injectable()
export class NoNulGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ url?: string; originalUrl?: string; params?: unknown; query?: unknown; body?: unknown }>();
    const url = req.originalUrl ?? req.url ?? '';
    if (url.startsWith('/webhooks/')) return true;
    if (url.includes('%00') || hasNul(req.params) || hasNul(req.query) || hasNul(req.body)) throw new BadRequestException('Text cannot contain a NUL character.');
    return true;
  }
}
