import { cookies } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Forwards a sign-in style request to the API. When the API returns a session token it is moved into an
 * httpOnly cookie (browser JavaScript never sees it) and removed from the response body.
 */
export async function forwardAndSetSession(path: string, req: Request): Promise<Response> {
  const res = await fetch(`${API}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: await req.text(), cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return Response.json(data, { status: res.status });
  if (typeof data.token === 'string') {
    (await cookies()).set('wa_token', data.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 7 * 24 * 3600 });
    delete data.token;
  }
  return Response.json(data, { status: res.status });
}
