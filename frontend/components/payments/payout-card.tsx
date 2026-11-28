'use client';
import { Landmark, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { mutate } from 'swr';
import { Button, Card, CardBody, CardHeader, ErrorNote, Field, Input, Loading, Notice, Select, StatusDot, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';

interface Status { available: boolean; supported: boolean; currency: string; connected: boolean; bankName: string | null; accountName: string | null; last4: string | null }
interface Bank { name: string; code: string }

/** Where this business receives online payments. Customers pay by card or bank on Paystack and the money is settled to this account. */
export function PayoutCard({ owner }: { owner: boolean }) {
  const toast = useToast();
  const { data: s, isLoading } = useApi<Status>('payments/status');
  const { data: banks } = useApi<Bank[]>(s?.available && s.supported && !s.connected ? 'payments/banks' : null);
  const [bank, setBank] = useState('');
  const [num, setNum] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'save' | 'off' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const valid = bank !== '' && /^\d{10}$/.test(num);

  async function check() {
    setBusy('check'); setErr(null); setName(null);
    try { setName((await api.post<{ accountName: string }>('payments/resolve-account', { bankCode: bank, accountNumber: num })).accountName); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function save() {
    setBusy('save'); setErr(null);
    try {
      await api.post('payments/payout-account', { bankCode: bank, accountNumber: num });
      await mutate('payments/status');
      setNum(''); setName(null); setBank('');
      toast('Online payments are on');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function disconnect() {
    setBusy('off'); setErr(null);
    try { await api.delete('payments/payout-account'); await mutate('payments/status'); toast('Online payments are off'); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }

  if (isLoading || !s) return <Card><Loading /></Card>;

  return (
    <Card>
      <CardHeader title="Online payments" />
      <CardBody className="space-y-4">
        {!s.available ? (
          <Notice title="Not switched on yet" />
        ) : !s.supported ? (
          <Notice title="Naira only for now" />
        ) : s.connected ? (
          <>
            <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-success/25 bg-success-bg text-success"><Landmark className="size-[18px]" strokeWidth={1.75} /></span>
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="truncate font-medium">{s.accountName}</div>
                <div className="text-muted-foreground">{s.bankName} · <span className="font-mono tabular-nums">•••• {s.last4}</span></div>
              </div>
              <StatusDot tone="success">Receiving payments</StatusDot>
            </div>
            
            {err && <ErrorNote>{err}</ErrorNote>}
            {owner && <Button variant="secondary" onClick={disconnect} loading={busy === 'off'}>Turn off online payments</Button>}
          </>
        ) : !owner ? (
          <Notice title="Owner only" />
        ) : (
          <>
            
            {err && <ErrorNote>{err}</ErrorNote>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank"><Select value={bank} onChange={(e) => { setBank(e.target.value); setName(null); }}><option value="">Choose your bank</option>{/* Paystack's list repeats some banks, so the position keeps keys unique */}{banks?.map((b, i) => <option key={`${b.code}-${i}`} value={b.code}>{b.name}</option>)}</Select></Field>
              <Field label="Account number" hint={`${num.length} of 10 digits`}><Input className="font-mono tabular-nums tracking-wider" inputMode="numeric" maxLength={10} value={num} onChange={(e) => { setNum(e.target.value.replace(/\D/g, '')); setName(null); }} /></Field>
            </div>
            {name ? (
              <div className="animate-rise rounded-xl border border-brand/25 bg-brand/[0.05] p-4 text-[13px]">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-brand" />Account name from your bank</div>
                <div className="mt-1 text-base font-semibold tracking-tight">{name}</div>
                
                <div className="mt-3 flex gap-2"><Button onClick={save} loading={busy === 'save'}>Yes, use this account</Button><Button variant="ghost" onClick={() => setName(null)}>Change</Button></div>
              </div>
            ) : (
              <Button onClick={check} loading={busy === 'check'} disabled={!valid}>Check account</Button>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
