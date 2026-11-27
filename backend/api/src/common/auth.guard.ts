import { createParamDecorator, ForbiddenException, Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import { PRISMA } from '../infra.module.js';
import { verifyToken } from './security.js';

export interface AuthCtx {
  userId: string;
  businessId: string;
  role: 'owner' | 'agent';
}

/**
 * Every dashboard route sits behind this guard. The business id comes ONLY from the verified token + a live
 * membership lookup, never from the request body or URL, so a user can't reach another tenant's data.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; auth?: AuthCtx }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    let claims: { userId: string; businessId: string };
    try {
      claims = await verifyToken(header.slice(7));
    } catch {
      throw new UnauthorizedException();
    }
    const membership = await this.db.membership.findUnique({
      where: { userId_businessId: { userId: claims.userId, businessId: claims.businessId } }
    });
    if (!membership) throw new UnauthorizedException();
    req.auth = { userId: claims.userId, businessId: claims.businessId, role: membership.role };
    return true;
  }
}

export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthCtx => {
  return ctx.switchToHttp().getRequest<{ auth: AuthCtx }>().auth;
});

export function requireOwner(auth: AuthCtx): void {
  if (auth.role !== 'owner') throw new ForbiddenException('Only the owner can do this');
}
