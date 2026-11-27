'use client';
import { CheckCircle2, Landmark } from 'lucide-react';
import { useState } from 'react';
import { mutate } from 'swr';
import { Button, Card, CardBody, CardHeader, ErrorNote, Field, Input, Loading, Select, useToast } from '@/components/ui';
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
      <CardHeader title="Online payments" description="Let customers pay by card or bank transfer from a link in the chat. We confirm each payment automatically." />
      <CardBody className="space-y-4">
        {!s.available ? (
          <p className="text-[13px] text-muted-foreground">Online payments are not switched on for this service yet. Until then your assistant gives customers the payment details you set under Business and you mark orders paid yourself.</p>
        ) : !s.supported ? (
          <p className="text-[13px] text-muted-foreground">Online payments are only available for businesses paid in Nigerian naira for now. You can keep confirming payments yourself on each order.</p>
        ) : s.connected ? (
          <>
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              <div className="text-[13px]">
                <div className="font-medium">Payments go to {s.accountName}</div>
                <div className="text-muted-foreground">{s.bankName}, account ending {s.last4}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Customers see a Paystack checkout. Paystack&apos;s fee is taken from each payment. Orders are marked paid and stock is updated as soon as a payment goes through.</p>
            {err && <ErrorNote>{err}</ErrorNote>}
            {owner && <Button variant="secondary" onClick={disconnect} loading={busy === 'off'}>Turn off online payments</Button>}
          </>
        ) : !owner ? (
          <p className="text-[13px] text-muted-foreground">Only the business owner can set up online payments.</p>
        ) : (
          <>
            <div className="flex items-start gap-3 text-[13px] text-muted-foreground"><Landmark className="mt-0.5 size-4 shrink-0" />Add the bank account where you want to receive your money. It must be in your own or your business&apos;s name.</div>
            {err && <ErrorNote>{err}</ErrorNote>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank"><Select value={bank} onChange={(e) => { setBank(e.target.value); setName(null); }}><option value="">Choose your bank</option>{banks?.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</Select></Field>
              <Field label="Account number" hint="10 digits"><Input inputMode="numeric" maxLength={10} value={num} onChange={(e) => { setNum(e.target.value.replace(/\D/g, '')); setName(null); }} /></Field>
            </div>
            {name ? (
              <div className="rounded-lg border bg-muted/30 p-4 text-[13px]">
                <div className="text-muted-foreground">Account name</div>
                <div className="mt-0.5 text-base font-medium">{name}</div>
                <p className="mt-2 text-xs text-muted-foreground">Only continue if this is your account. Payments will be sent here.</p>
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
