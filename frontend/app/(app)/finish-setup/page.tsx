'use client';
import { Check, Circle } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { mutate } from 'swr';
import { Button, Card, CardBody, CardFooter, CardHeader, ErrorNote, Field, Input, Loading, PageHeader, Section, Select, useToast } from '@/components/ui';
import { api, useApi, useMe } from '@/lib/api';
import type { BusinessDetail } from '@/lib/types';
import { useMoney } from '@/lib/use-money';

const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']] as const;
const PAY = [['bank_transfer', 'Bank transfer'], ['card_link', 'Online card payment link'], ['cash_on_delivery', 'Cash on delivery'], ['pay_at_shop', 'Pay in person']] as const;
type Hours = Record<string, { closed: boolean; open: string; close: string }>;

function initialHours(raw: BusinessDetail['businessHours']): Hours {
  return Object.fromEntries(DAYS.map(([d]) => {
    const v = raw?.[d];
    const m = typeof v === 'string' ? /^(\d\d:\d\d)-(\d\d:\d\d)$/.exec(v) : null;
    return [d, { closed: v === 'closed', open: m?.[1] ?? '09:00', close: m?.[2] ?? '18:00' }];
  }));
}

export default function FinishSetupPage() {
  const { data: biz } = useApi<BusinessDetail>('business');
  const { data: me } = useMe();
  if (!biz || !me) return <Loading />;
  return <Form key={biz.id} biz={biz} owner={me.role === 'owner'} />;
}

function Form({ biz, owner }: { biz: BusinessDetail; owner: boolean }) {
  const toast = useToast();
  const money = useMoney();
  const services = biz.kind === 'services';
  const showServices = biz.kind !== 'goods';
  const [hours, setHours] = useState<Hours>(initialHours(biz.businessHours));
  const [pay, setPay] = useState<string[]>(biz.payMethods);
  const [f, setF] = useState({
    bankName: biz.bankName ?? '', bankAccountNumber: biz.bankAccountNumber ?? '', bankAccountName: biz.bankAccountName ?? '',
    fulfilment: biz.fulfilment ?? '', address: biz.address ?? '', ownerPhone: biz.ownerPhone ?? '',
    returnType: biz.returnType ?? '', returnDays: biz.returnDays?.toString() ?? '', cancellationHours: biz.cancellationHours?.toString() ?? '',
    deposit: biz.depositRequired === null ? '' : biz.depositRequired ? 'yes' : 'no',
    minOrder: biz.minOrderMinor ? money.toInput(biz.minOrderMinor) : '', noticeHours: biz.noticeHours?.toString() ?? ''
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const cardReady = !!biz.paystackSubaccountCode && biz.currency === 'NGN';
  const fulOptions = services
    ? [['visit', 'We go to the customer'], ['onsite', 'Customers come to us'], ['both', 'Both']]
    : biz.kind === 'both'
      ? [['delivery', 'We deliver / visit'], ['pickup', 'Customers collect / come to us'], ['both', 'Both']]
      : [['delivery', 'Delivery only'], ['pickup', 'Pickup only'], ['both', 'Delivery and pickup']];
  const needsAddress = ['pickup', 'onsite', 'both'].includes(f.fulfilment);

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const minor = f.minOrder.trim() ? money.parse(f.minOrder) : null;
      if (f.minOrder.trim() && minor === null) throw new Error('Minimum order is not a valid amount');
      await api.put('business/setup', {
        hours: Object.fromEntries(DAYS.map(([d]) => [d, hours[d]!.closed ? 'closed' : `${hours[d]!.open}-${hours[d]!.close}`])),
        payMethods: pay,
        bankName: f.bankName.trim() || null, bankAccountNumber: f.bankAccountNumber.replace(/\s/g, '') || null, bankAccountName: f.bankAccountName.trim() || null,
        fulfilment: f.fulfilment || null, address: f.address.trim() || null, ownerPhone: f.ownerPhone.replace(/\D/g, '') || null,
        returnType: f.returnType || null, returnDays: f.returnType && f.returnType !== 'none' ? num(f.returnDays) : null,
        noticeHours: num(f.noticeHours), minOrderMinor: minor,
        ...(showServices ? { cancellationHours: num(f.cancellationHours), depositRequired: f.deposit === '' ? null : f.deposit === 'yes' } : {})
      });
      await mutate('business'); toast('Saved');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const left = biz.readiness.items.filter((i) => !i.done);
  return (
    <form onSubmit={save} className="mx-auto max-w-3xl">
      <PageHeader title="Finish setup" description={left.length ? 'Your assistant stays off until these are done.' : 'All done. Your assistant can talk to customers.'} />
      {(err || !owner) && <div className="mb-6 space-y-2">{err && <ErrorNote>{err}</ErrorNote>}{!owner && <ErrorNote>Only the account owner can change this.</ErrorNote>}</div>}
      <Card className="mb-8"><CardBody className="space-y-2">
        {biz.readiness.items.map((i) => (
          <div key={i.key} className="flex items-center gap-2.5 text-[13px]">
            {i.done ? <Check className="size-4 text-brand" /> : <Circle className="size-4 text-muted-foreground" />}
            <span className={i.done ? 'text-muted-foreground' : 'font-medium'}>{i.label}</span>
            {i.key === 'products' && !i.done && <Link href="/products" className="ml-auto text-brand underline">Add</Link>}
          </div>
        ))}
      </CardBody></Card>

      <fieldset disabled={!owner}>
        <Section title="Opening hours">
          <Card><CardBody className="space-y-2">
            {DAYS.map(([d, name]) => (
              <div key={d} className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-[13px]">{name}</span>
                <Input type="time" className="w-32" disabled={hours[d]!.closed} value={hours[d]!.open} onChange={(e) => setHours((h) => ({ ...h, [d]: { ...h[d]!, open: e.target.value } }))} />
                <span className="text-muted-foreground">to</span>
                <Input type="time" className="w-32" disabled={hours[d]!.closed} value={hours[d]!.close} onChange={(e) => setHours((h) => ({ ...h, [d]: { ...h[d]!, close: e.target.value } }))} />
                <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={hours[d]!.closed} onChange={(e) => setHours((h) => ({ ...h, [d]: { ...h[d]!, closed: e.target.checked } }))} />Closed</label>
              </div>
            ))}
          </CardBody></Card>
        </Section>

        <Section title="How customers pay">
          <Card><CardBody className="space-y-3">
            {PAY.filter(([k]) => k !== 'cash_on_delivery' || !services).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={pay.includes(k)} disabled={k === 'card_link' && !cardReady} onChange={(e) => setPay((p) => (e.target.checked ? [...p, k] : p.filter((x) => x !== k)))} />
                {label}{k === 'card_link' && !cardReady && <span className="text-xs text-muted-foreground">(connect online payments under Business first)</span>}
              </label>
            ))}
            {pay.includes('bank_transfer') && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Bank"><Input value={f.bankName} onChange={set('bankName')} /></Field>
                <Field label="Account number"><Input inputMode="numeric" value={f.bankAccountNumber} onChange={set('bankAccountNumber')} /></Field>
                <Field label="Account name"><Input value={f.bankAccountName} onChange={set('bankAccountName')} /></Field>
              </div>
            )}
          </CardBody></Card>
        </Section>

        <Section title={services ? 'Where the service happens' : 'Getting it to the customer'}>
          <Card><CardBody className="space-y-4">
            <Field label="How do customers get it?"><Select value={f.fulfilment} onChange={set('fulfilment')}><option value="">Choose…</option>{fulOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            {needsAddress && <Field label="Your address"><Input value={f.address} onChange={set('address')} /></Field>}
            {['delivery', 'both'].includes(f.fulfilment) && !services && <p className="text-[13px] text-muted-foreground">Add the areas you cover and their fees under <Link href="/business?tab=delivery" className="text-brand underline">Business</Link>.</p>}
            {!services && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Minimum order (optional)"><Input inputMode="decimal" value={f.minOrder} onChange={set('minOrder')} /></Field>
                <Field label="Notice needed, in hours (optional)"><Input inputMode="numeric" value={f.noticeHours} onChange={set('noticeHours')} /></Field>
              </div>
            )}
          </CardBody></Card>
        </Section>

        {showServices && (
          <Section title="Booking rules">
            <Card><CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Free cancellation up to (hours before)" hint="0 means any time"><Input inputMode="numeric" value={f.cancellationHours} onChange={set('cancellationHours')} /></Field>
              <Field label="Deposit to book?"><Select value={f.deposit} onChange={set('deposit')}><option value="">Choose…</option><option value="no">No deposit</option><option value="yes">Deposit required</option></Select></Field>
            </CardBody></Card>
          </Section>
        )}

        <Section title="Returns and refunds">
          <Card><CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Policy"><Select value={f.returnType} onChange={set('returnType')}><option value="">Choose…</option><option value="none">No returns</option><option value="exchange">Exchange</option><option value="refund">Refund</option></Select></Field>
            {(f.returnType === 'exchange' || f.returnType === 'refund') && <Field label="Within how many days?"><Input inputMode="numeric" value={f.returnDays} onChange={set('returnDays')} /></Field>}
          </CardBody></Card>
        </Section>

        <Section title="Alerts">
          <Card>
            <CardHeader title="Your WhatsApp number" description="We message you here when a customer needs you." />
            <CardBody><Field label="Number" hint="Digits with country code, e.g. 2348012345678"><Input inputMode="numeric" value={f.ownerPhone} onChange={set('ownerPhone')} /></Field></CardBody>
            {owner && <CardFooter><Button type="submit" loading={busy}>Save</Button></CardFooter>}
          </Card>
        </Section>
      </fieldset>
    </form>
  );
}
