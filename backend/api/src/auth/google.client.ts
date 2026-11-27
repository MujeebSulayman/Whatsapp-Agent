import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface SocialProfile {
  /** The provider's stable user id. Never the email: emails can change. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/** The small surface the sign-in flow needs from an OpenID Connect provider (so tests can stand in for Google). */
export interface OidcClient {
  configured(): boolean;
  authUrl(p: { state: string; challenge: string; nonce: string }): string;
  exchange(p: { code: string; verifier: string; nonce: string }): Promise<SocialProfile>;
}

export const GOOGLE_CLIENT = 'GOOGLE_CLIENT';

/** PKCE: the verifier stays on our server; only its hash goes to Google. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** The URL you register in Google Cloud Console as an "Authorized redirect URI". */
export const googleRedirectUri = (): string => `${process.env.API_PUBLIC_URL ?? 'http://localhost:4000'}/auth/google/callback`;

export class GoogleClient implements OidcClient {
  private readonly jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

  configured(): boolean {
    return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  }

  authUrl({ state, challenge, nonce }: { state: string; challenge: string; nonce: string }): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: googleRedirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account'
    }).toString();
    return url.toString();
  }

  async exchange({ code, verifier, nonce }: { code: string; verifier: string; nonce: string }): Promise<SocialProfile> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
        code_verifier: verifier
      })
    });
    if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
    const { id_token: idToken } = (await res.json()) as { id_token?: string };
    if (!idToken) throw new Error('Google returned no id_token');
    // Verify signature, issuer, audience and expiry against Google's published keys.
    const { payload } = await jwtVerify(idToken, this.jwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: process.env.GOOGLE_CLIENT_ID
    });
    if (payload.nonce !== nonce) throw new Error('Nonce mismatch');
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') throw new Error('Google profile is missing sub or email');
    return { sub: payload.sub, email: payload.email, emailVerified: payload.email_verified === true, name: typeof payload.name === 'string' ? payload.name : null };
  }
}
