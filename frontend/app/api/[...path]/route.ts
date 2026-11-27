import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';

const API = process.env.API_URL ?? 'http://localhost:4000';

/** Same-origin proxy: the login token lives in an httpOnly cookie and is attached here, so browser JS never sees it. */
async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const token = (await cookies()).get('wa_token')?.value;
  const headers: Record<string, string> = {};
  const ct = req.headers.get('content-type');
  if (ct) headers['content-type'] = ct;
  if (token) headers.authorization = `Bearer ${token}`;
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const res = await fetch(`${API}/${path.join('/')}${req.nextUrl.search}`, {
    method: req.method,
    headers,
    body: hasBody ? await req.text() : undefined,
    cache: 'no-store'
  });
  if (res.status === 204) return new Response(null, { status: 204 });
  const type = res.headers.get('content-type') ?? 'application/json';
  if (type.startsWith('image/')) return new Response(await res.arrayBuffer(), { status: res.status, headers: { 'content-type': type, 'cache-control': res.headers.get('cache-control') ?? 'no-store' } });
  return new Response(await res.text(), { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
