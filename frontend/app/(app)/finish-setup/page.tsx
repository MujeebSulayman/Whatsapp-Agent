'use client';
import { Check, Circle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { mutate } from 'swr';
import { FaqList } from '@/components/faq-list';
import { DeliveryZones } from '@/components/delivery-zones';
import { ImportPanel } from '@/components/setup/import-panel';
import { PracticePanel } from '@/components/setup/practice-panel';
import { useAiAvailable } from '@/components/setup/use-ai';
import { Button, Card, CardBody, CardHeader, ErrorNote, Field, Input, Loading, Notice, PageHeader, Section, Select, Tabs, useToast } from '@/components/ui';
import { api, useApi, useMe } from '@/lib/api';
import type { BusinessDetail } from '@/lib/types';

interface PayStatus { available: boolean; supported: boolean }
type Tab = 'items' | 'hours' | 'payments' | 'delivery' | 'policies' | 'faqs' | 'try';
const TABS: Tab[] = ['items', 'hours', 'payments', 'delivery', 'policies', 'faqs', 'try'];
/** Tabs with answers to save. The others do their own saving or are just for trying things out. */
const FORM_TABS: Tab[] = ['hours', 'payments', 'delivery', 'policies'];
const TAB_OF: Record<string, Tab> = { products: 'items', hours: 'hours', payments: 'payments', fulfilment: 'delivery', booking: 'delivery', returns: 'policies', phone: 'policies' };
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
  const services = biz.kind === 'services';
  const showServices = biz.kind !== 'goods';
  const [hours, setHours] = useState<Hours>(initialHours(biz.businessHours));
  const [pay, setPay] = useState<string[]>(biz.payMethods);
  const [f, setF] = useState({
    bankName: biz.bankName ?? '', bankAccountNumber: biz.bankAccountNumber ?? '', bankAccountName: biz.bankAccountName ?? '',
    fulfilment: biz.fulfilment ?? '', address: biz.address ?? '', ownerPhone: biz.ownerPhone ?? '',
    returnType: biz.returnType ?? '', returnDays: biz.returnDays?.toString() ?? '', cancellationHours: biz.cancellationHours?.toString() ?? '',
    deposit: biz.depositRequired === null ? '' : biz.depositRequired ? 'yes' : 'no'
  });
  const { data: ps } = useApi<PayStatus>('payments/status');
  const lookup = !!ps?.available && ps.supported;
  const { data: banks } = useApi<{ name: string; code: string }[]>(lookup && pay.includes('bank_transfer') ? 'payments/banks' : null);
  const [bankCode, setBankCode] = useState('');
  const [resolving, setResolving] = useState(false);
  const [acctErr, setAcctErr] = useState<string | null>(null);
  const ai = useAiAvailable();
  const [tab, setTab] = useState<Tab>(() => { const open = biz.readiness.items.find((i) => !i.done); return open ? TAB_OF[open.key] ?? 'items' : 'try'; });
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

  // Pick up the saved bank in the list once it loads.
  useEffect(() => {
    if (banks && !bankCode && f.bankName) setBankCode(banks.find((b) => b.name === f.bankName)?.code ?? '');
  }, [banks, bankCode, f.bankName]);

  // Look up the account name as soon as the bank and a 10 digit number are in.
  async function check(code: string, num: string, bankName: string) {
    setAcctErr(null);
    if (!code || !/^\d{10}$/.test(num)) { setF((s) => ({ ...s, bankName, bankAccountName: '' })); return; }
    setResolving(true);
    try {
      const { accountName } = await api.post<{ accountName: string }>('payments/resolve-account', { bankCode: code, accountNumber: num });
      setF((s) => ({ ...s, bankName, bankAccountName: accountName }));
    } catch (e) { setF((s) => ({ ...s, bankName, bankAccountName: '' })); setAcctErr((e as Error).message); } finally { setResolving(false); }
  }

  async function save(e?: FormEvent) {
    e?.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.put('business/setup', {
        hours: Object.fromEntries(DAYS.map(([d]) => [d, hours[d]!.closed ? 'closed' : `${hours[d]!.open}-${hours[d]!.close}`])),
        payMethods: pay,
        bankName: f.bankName.trim() || null, bankAccountNumber: f.bankAccountNumber.replace(/\s/g, '') || null, bankAccountName: f.bankAccountName.trim() || null,
        fulfilment: f.fulfilment || null, address: f.address.trim() || null, ownerPhone: f.ownerPhone.replace(/\D/g, '') || null,
        returnType: f.returnType || null, returnDays: f.returnType && f.returnType !== 'none' ? num(f.returnDays) : null,
        ...(showServices ? { cancellationHours: num(f.cancellationHours), depositRequired: f.deposit === '' ? null : f.deposit === 'yes' } : {})
      });
      await mutate('business');
      const next = TABS[TABS.indexOf(tab) + 1];
      if (next) { setTab(next); window.scrollTo({ top: 0 }); toast('Saved. Next step.'); } else toast('Saved');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const left = biz.readiness.items.filter((i) => !i.done);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Finish setup" description={left.length ? 'Your assistant stays off until these are done.' : 'All done. Your assistant can talk to customers.'} />
      {(err || !owner) && <div className="mb-6 space-y-2">{err && <ErrorNote>{err}</ErrorNote>}{!owner && <ErrorNote>Only the account owner can change this.</ErrorNote>}</div>}
      <Card className="mb-6"><CardBody className="space-y-2">
        {biz.readiness.items.map((i) => (
          <div key={i.key} className="flex items-center gap-2.5 text-[13px]">
            {i.done ? <Check className="size-4 text-brand" /> : <Circle className="size-4 text-muted-foreground" />}
            <span className={i.done ? 'text-muted-foreground' : 'font-medium'}>{i.label}</span>
            {i.key === 'products' && !i.done && <Link href="/products" className="ml-auto text-brand underline">Add</Link>}
          </div>
        ))}
      </CardBody></Card>

      <div className="mb-8"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'items', label: services ? 'Services' : biz.kind === 'both' ? 'Products & services' : 'Products' }, { id: 'hours', label: 'Opening hours' }, { id: 'payments', label: 'Payments' }, { id: 'delivery', label: services ? 'Service' : 'Delivery' }, { id: 'policies', label: 'Policies & alerts' }, { id: 'faqs', label: 'FAQs' }, { id: 'try', label: 'Try it' }]} /></div>
      {tab === 'items' && (
        <div className="space-y-4">
          {!ai.available && <Notice tone="warning" title="AI isn't switched on yet" />}
          <ImportPanel />
        </div>
      )}
      {tab === 'faqs' && (
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">Add the questions customers ask most, with your answers. Optional, and you can add as many as you like.</p>
          <FaqList />
          <div><Button variant="secondary" onClick={() => setTab('try')}>Next: try it</Button></div>
        </div>
      )}
      {tab === 'try' && (
        <div className="mx-auto max-w-xl">
          <p className="mb-4 text-[13px] text-muted-foreground">Chat with your assistant the way a customer would. Nothing here is sent to anyone.</p>
          <PracticePanel />
        </div>
      )}
      <fieldset disabled={!owner} className={FORM_TABS.includes(tab) ? undefined : 'hidden'}>
        {tab === 'hours' && <Section title="Opening hours">
          <Card><CardBody className="space-y-2">
            {DAYS.map(([d, name]) => (
              <div key={d} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 border-b border-border/50 pb-3 last:border-0 last:pb-0 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:border-0 sm:pb-0">
                <span className="text-[13px] font-medium sm:font-normal">{name}</span>
                <label className="flex items-center gap-1.5 whitespace-nowrap text-[13px] sm:order-3"><input type="checkbox" checked={hours[d]!.closed} onChange={(e) => setHours((h) => ({ ...h, [d]: { ...h[d]!, closed: e.target.checked } }))} />Closed</label>
                <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:order-2 sm:col-span-1">
                  <Input type="time" disabled={hours[d]!.closed} value={hours[d]!.open} onChange={(e) => setHours((h) => ({ ...h, [d]: { ...h[d]!, open: e.target.value } }))} />
                  <span className="text-muted-foreground">to</span>
                  <Input type="time" disabled={hours[d]!.closed} value={hours[d]!.close} onChange={(e) => setHours((h) => ({ ...h, [d]: { ...h[d]!, close: e.target.value } }))} />
                </div>
              </div>
            ))}
          </CardBody></Card>
        </Section>}

        {tab === 'payments' && <Section title="How customers pay">
          <Card><CardBody className="space-y-3">
            {PAY.filter(([k]) => k !== 'cash_on_delivery' || !services).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={pay.includes(k)} disabled={k === 'card_link' && !cardReady} onChange={(e) => setPay((p) => (e.target.checked ? [...p, k] : p.filter((x) => x !== k)))} />
                {label}{k === 'card_link' && !cardReady && <span className="text-xs text-muted-foreground">(connect online payments under Business first)</span>}
              </label>
            ))}
            {pay.includes('bank_transfer') && (lookup ? (
              <div className="space-y-3">
                <Field label="Bank">
                  <Select value={bankCode} onChange={(e) => { const c = e.target.value; setBankCode(c); void check(c, f.bankAccountNumber, banks?.find((b) => b.code === c)?.name ?? ''); }}>
                    <option value="">Choose your bank</option>
                    {banks?.map((b, i) => <option key={`${b.code}-${i}`} value={b.code}>{b.name}</option>)}
                  </Select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Account number" error={acctErr}>
                    <Input inputMode="numeric" maxLength={10} value={f.bankAccountNumber} onChange={(e) => { const n = e.target.value.replace(/\D/g, ''); setF((s) => ({ ...s, bankAccountNumber: n })); void check(bankCode, n, f.bankName); }} />
                  </Field>
                  <Field label="Account name">
                    <Input readOnly value={resolving ? 'Checking…' : f.bankAccountName} placeholder="Appears after you enter the number" />
                  </Field>
                </div>
                {f.bankAccountName && !resolving && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-brand" />Account name from your bank</div>}
              </div>
            ) : (
              <div className="space-y-3">
                <Field label="Bank"><Input value={f.bankName} onChange={set('bankName')} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Account number"><Input inputMode="numeric" value={f.bankAccountNumber} onChange={set('bankAccountNumber')} /></Field>
                  <Field label="Account name"><Input value={f.bankAccountName} onChange={set('bankAccountName')} /></Field>
                </div>
              </div>
            ))}
          </CardBody></Card>
        </Section>}

        {tab === 'delivery' && <Section title={services ? 'Where the service happens' : 'Delivery or pickup'}>
          <Card><CardBody className="space-y-4">
            <Field label={services ? 'Where do you do the service?' : 'How do customers get their order?'}><Select value={f.fulfilment} onChange={set('fulfilment')}><option value="">Choose…</option>{fulOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            {needsAddress && <Field label="Your address"><Input value={f.address} onChange={set('address')} /></Field>}
          </CardBody></Card>
          {['delivery', 'both', 'visit'].includes(f.fulfilment) && <div className="mt-4"><DeliveryZones /></div>}
        </Section>}

        {tab === 'delivery' && showServices && (
          <Section title="Cancellations and deposit">
            <Card><CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Customers can cancel free until … hours before" hint="Example: 24 means they must cancel a day ahead. 0 means they can cancel any time."><Input inputMode="numeric" value={f.cancellationHours} onChange={set('cancellationHours')} /></Field>
              <Field label="Do customers pay a deposit to book?"><Select value={f.deposit} onChange={set('deposit')}><option value="">Choose…</option><option value="no">No, they pay later</option><option value="yes">Yes, a deposit is needed</option></Select></Field>
            </CardBody></Card>
          </Section>
        )}

        {tab === 'policies' && <Section title="Returns and refunds">
          <Card><CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Policy"><Select value={f.returnType} onChange={set('returnType')}><option value="">Choose…</option><option value="none">No returns</option><option value="exchange">Exchange</option><option value="refund">Refund</option></Select></Field>
            {(f.returnType === 'exchange' || f.returnType === 'refund') && <Field label="Within how many days?"><Input inputMode="numeric" value={f.returnDays} onChange={set('returnDays')} /></Field>}
          </CardBody></Card>
        </Section>}

        {tab === 'policies' && <Section title="Alerts">
          <Card>
            <CardHeader title="Your WhatsApp number" description="We message you here when a customer needs you." />
            <CardBody><Field label="Number" hint="Digits with country code, e.g. 2348012345678"><Input inputMode="numeric" value={f.ownerPhone} onChange={set('ownerPhone')} /></Field></CardBody>
          </Card>
        </Section>}
      </fieldset>
      {owner && FORM_TABS.includes(tab) && <div className="mt-2"><Button onClick={() => void save()} loading={busy}>Save and continue</Button></div>}
      {tab === 'items' && <div className="mt-6"><Button variant="secondary" onClick={() => setTab('hours')}>Next: opening hours</Button></div>}
    </div>
  );
}
