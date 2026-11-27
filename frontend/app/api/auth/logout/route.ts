import { cookies } from 'next/headers';

export async function POST() {
  (await cookies()).delete('wa_token');
  return new Response(null, { status: 204 });
}
