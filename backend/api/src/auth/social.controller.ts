import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Post, Query, Redirect, UnauthorizedException } from '@nestjs/common';
import type { PrismaClient } from '@wa/db';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { signToken } from '../common/security.js';
import { parse } from '../common/validate.js';
import { PRISMA, REDIS } from '../infra.module.js';
import { AccountsService, BusinessProfile } from './accounts.service.js';
import { GOOGLE_CLIENT, pkcePair, type OidcClient } from './google.client.js';

const frontend = () => process.env.FRONTEND_URL ?? 'http://localhost:3000';
const newToken = () => randomBytes(24).toString('base64url');
const STATE_TTL = 600; // the user has 10 minutes to finish at Google
const LOGIN_TICKET_TTL = 120; // single-use, redeemed straight after the redirect
const PENDING_TTL = 900; // a new user has 15 minutes to fill in their business details

type Ticket =
  | { kind: 'login'; userId: string; businessId: string }
  | { kind: 'pending'; provider: 'google'; sub: string; email: string; name: string | null };

/**
 * Sign in with Google (OpenID Connect, authorization code + PKCE). The browser only ever sees short-lived,
 * single-use tickets: the client secret, tokens and Google's id_token never leave the server.
 */
@Controller('auth')
export class SocialAuthController {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(GOOGLE_CLIENT) private readonly google: OidcClient,
    @Inject(AccountsService) private readonly accounts: AccountsService
  ) {}

  /** Which sign-in buttons the dashboard should show. A provider that isn't configured is simply not offered. */
  @Get('providers')
  providers() {
    return { google: this.google.configured() };
  }

  @Get('google/start')
  async start() {
    if (!this.google.configured()) throw new NotFoundException('Google sign-in is not set up');
    const state = newToken();
    const nonce = newToken();
    const { verifier, challenge } = pkcePair();
    await this.redis.set(`oauth:state:${state}`, JSON.stringify({ verifier, nonce }), 'EX', STATE_TTL);
    return { url: this.google.authUrl({ state, challenge, nonce }) };
  }

  /** Google sends the browser here. Always ends in a redirect back to the dashboard, never an API error page. */
  @Get('google/callback')
  @Redirect()
  async callback(@Query('code') code?: string, @Query('state') state?: string, @Query('error') error?: string) {
    const fail = (message: string) => ({ url: `${frontend()}/login?error=${encodeURIComponent(message)}`, statusCode: 302 });
    if (error || !code || !state) return fail('Google sign-in was cancelled.');

    const raw = await this.redis.getdel(`oauth:state:${state}`); // single use: a replayed callback finds nothing
    if (!raw) return fail('That sign-in link expired. Please try again.');
    const { verifier, nonce } = JSON.parse(raw) as { verifier: string; nonce: string };

    let profile;
    try {
      profile = await this.google.exchange({ code, verifier, nonce });
    } catch {
      return fail('Google sign-in failed. Please try again.');
    }
    if (!profile.emailVerified) return fail('Your Google email address is not verified.');
    const email = profile.email.toLowerCase();

    // 1) already linked to Google, or 2) same verified email as an existing account: sign them in.
    let userId = (await this.db.authIdentity.findUnique({ where: { provider_subject: { provider: 'google', subject: profile.sub } } }))?.userId;
    if (!userId) {
      const existing = await this.db.user.findUnique({ where: { email } });
      if (existing) {
        userId = existing.id;
        await this.db.authIdentity.create({ data: { userId, provider: 'google', subject: profile.sub, email } });
      }
    }
    if (userId) {
      const membership = await this.db.membership.findFirst({ where: { userId }, orderBy: { role: 'asc' } });
      if (membership) return this.ticketRedirect({ kind: 'login', userId, businessId: membership.businessId }, LOGIN_TICKET_TTL);
    }
    // 3) brand new: they still need to tell us about their business.
    return this.ticketRedirect({ kind: 'pending', provider: 'google', sub: profile.sub, email, name: profile.name }, PENDING_TTL);
  }

  /** Swap the redirect ticket for a session (returning user) or for the details we already know (new user). */
  @Post('social/exchange')
  @HttpCode(200)
  async exchange(@Body() body: unknown) {
    const { ticket } = parse(z.object({ ticket: z.string().min(10).max(100) }), body);
    const key = `oauth:ticket:${ticket}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new UnauthorizedException('This sign-in link has expired');
    const data = JSON.parse(raw) as Ticket;

    if (data.kind === 'pending') return { pending: { provider: data.provider, email: data.email, name: data.name } };

    if (!(await this.redis.getdel(key))) throw new UnauthorizedException('This sign-in link has already been used');
    const [user, business] = await Promise.all([
      this.db.user.findUniqueOrThrow({ where: { id: data.userId }, select: { id: true, email: true, name: true } }),
      this.db.business.findUniqueOrThrow({ where: { id: data.businessId }, select: { id: true, name: true } })
    ]);
    return { token: await signToken(user.id, business.id), user, business };
  }

  /** New Google user submits their business details: creates the account with no password. */
  @Post('social/complete')
  @HttpCode(201)
  async complete(@Body() body: unknown) {
    const { ticket, ...profile } = parse(BusinessProfile.extend({ ticket: z.string().min(10).max(100) }), body);
    const raw = await this.redis.getdel(`oauth:ticket:${ticket}`); // single use
    const data = raw ? (JSON.parse(raw) as Ticket) : null;
    if (!data || data.kind !== 'pending') throw new UnauthorizedException('This sign-in link has expired. Please start again.');
    return this.accounts.create({
      email: data.email,
      name: data.name ?? data.email.split('@')[0]!,
      passwordHash: null,
      identity: { provider: data.provider, subject: data.sub },
      profile
    });
  }

  private async ticketRedirect(ticket: Ticket, ttl: number) {
    const id = newToken();
    await this.redis.set(`oauth:ticket:${id}`, JSON.stringify(ticket), 'EX', ttl);
    return { url: `${frontend()}/auth/callback?ticket=${id}`, statusCode: 302 };
  }
}
