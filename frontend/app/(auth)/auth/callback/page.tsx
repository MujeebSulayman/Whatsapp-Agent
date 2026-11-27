'use client';
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

/** Google sends people back to the API, which redirects here with a short-lived one-time ticket. */
function Finish() {
  const router = useRouter();
  const ticket = useSearchParams().get('ticket');
  const started = useRef(false); // the ticket is single-use: never redeem it twice (React strict mode runs effects twice in dev)

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!ticket) return void router.replace('/login');
    api.post<{ pending?: unknown }>('auth/social/exchange', { ticket })
      .then((r) => router.replace(r.pending ? `/signup?social=${encodeURIComponent(ticket)}` : '/inbox'))
      .catch((e: Error) => router.replace(`/login?error=${encodeURIComponent(e.message)}`));
  }, [ticket, router]);

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}

export default function CallbackPage() {
  return <Suspense fallback={null}><Finish /></Suspense>;
}
