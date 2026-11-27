import { cookies } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:4000';

export async function POST(req: Request) {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: await req.text(), cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return Response.json(data, { status: res.status });
  (await cookies()).set('wa_token', data.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 7 * 24 * 3600 });
  return Response.json({ user: data.user, business: data.business }, { status: res.status });
}
