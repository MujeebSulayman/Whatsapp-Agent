'use client';
import { Download, HelpCircle, MapPin, Pencil, Plus, Plug, Trash2, Unplug } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { mutate } from 'swr';
import { PayoutCard } from '@/components/payments/payout-card';
import { SuggestButton } from '@/components/setup/suggest-button';
import { Button, Card, CardBody, CardFooter, CardHeader, Dialog, EmptyState, ErrorNote, Field, IconButton, Input, Loading, PageHeader, Section, Select, StatusDot, Table, Tabs, TD, TH, THead, Textarea, TR, useToast } from '@/components/ui';
import { api, useApi, useMe } from '@/lib/api';
import type { BusinessDetail, Faq, Zone } from '@/lib/types';
import { COUNTRIES, currencyOptions, timezoneOptions } from '@/lib/countries';
import { CATEGORIES, KIND_OPTIONS, type Kind } from '@/lib/categories';
import { useLabels } from '@/lib/use-labels';
import { useMoney } from '@/lib/use-money';

type Tab = 'profile' | 'delivery' | 'faqs' | 'payments' | 'whatsapp' | 'data';

export default function BusinessPage() {
  return <Suspense fallback={<Loading />}><Inner /></Suspense>;
}

function Inner() {
  const params = useSearchParams();
  const initial = (['profile', 'delivery', 'faqs', 'payments', 'whatsapp', 'data'] as const).find((t) => t === params.get('tab')) ?? 'profile';
  const [tab, setTab] = useState<Tab>(initial);
  const { data: biz } = useApi<BusinessDetail>('business');
  const { data: me } = useMe();
  const labels = useLabels();
  if (!biz || !me) return <Loading />;
  const owner = me.role === 'owner';
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Business" />
      <div className="mb-8"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'profile', label: 'Profile' }, { id: 'delivery', label: labels.zoneTab }, { id: 'faqs', label: 'FAQs' }, { id: 'payments', label: 'Payments' }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'data', label: 'Data & privacy' }]} /></div>
      {tab === 'profile' && <Profile biz={biz} owner={owner} />}
      {tab === 'delivery' && <Delivery />}
      {tab === 'faqs' && <Faqs />}
      {tab === 'payments' && <PayoutCard owner={owner} />}
      {tab === 'whatsapp' && <Whatsapp biz={biz} owner={owner} />}
      {tab === 'data' && <DataPrivacy biz={biz} owner={owner} />}
    </div>
  );
}

/* ---------------- Profile ---------------- */
function Profile({ biz, owner }: { biz: BusinessDetail; owner: boolean }) {
  const toast = useToast();
  const [f, setF] = useState({ name: biz.name, category: biz.category, city: biz.city, kind: biz.kind, country: biz.country, currency: biz.currency, timezone: biz.timezone, paymentInfo: biz.paymentInfo ?? '', returnPolicy: biz.returnPolicy ?? '', ownerPhone: biz.ownerPhone ?? '' });
  const [hours, setHours] = useState<{ label: string; value: string }[]>(Object.entries(biz.businessHours ?? {}).map(([label, value]) => ({ label, value })));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currencies = useMemo(() => currencyOptions(), []);
  const timezones = useMemo(() => timezoneOptions(), []);
  const currencyLocked = biz.setup.products || biz.setup.zones;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const rows = hours.filter((h) => h.label.trim() && h.value.trim());
      await api.patch('business', {
        name: f.name.trim(), category: f.category.trim(), kind: f.kind, city: f.city.trim(), country: f.country, timezone: f.timezone, ...(f.currency !== biz.currency ? { currency: f.currency } : {}),
        paymentInfo: f.paymentInfo.trim() || null, returnPolicy: f.returnPolicy.trim() || null, ownerPhone: f.ownerPhone.trim() || null,
        businessHours: rows.length ? Object.fromEntries(rows.map((h) => [h.label.trim(), h.value.trim()])) : null
      });
      await mutate('business'); toast('Business details saved');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save}>
      {(err || !owner) && <div className="mb-6 space-y-2">{err && <ErrorNote>{err}</ErrorNote>}{!owner && <ErrorNote>Only the account owner can edit these details.</ErrorNote>}</div>}
      <Section title="Basics">
        <Card><CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name"><Input required value={f.name} onChange={set('name')} disabled={!owner} /></Field>
            <Field label="City"><Input required value={f.city} onChange={set('city')} disabled={!owner} /></Field>
          </div>
          <Field label="What your business does"><Input required list="category-suggestions" value={f.category} onChange={set('category')} disabled={!owner} /><datalist id="category-suggestions">{CATEGORIES.map((c) => <option key={c.name} value={c.name} />)}</datalist></Field>
          <Field label="How customers buy from you" hint={KIND_OPTIONS.find((o) => o.value === f.kind)?.hint}>
            <Select value={f.kind} onChange={(e) => setF((s) => ({ ...s, kind: e.target.value as Kind }))} disabled={!owner}>{KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
          </Field>
        </CardBody></Card>
      </Section>
      <Section title="Region">
        <Card><CardBody className="space-y-4">
          <Field label="Country"><Select value={f.country} onChange={set('country')} disabled={!owner}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}</Select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" hint={currencyLocked ? "Locked: already in use" : undefined}>
              <Select value={f.currency} onChange={set('currency')} disabled={!owner || currencyLocked}>{currencies.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</Select>
            </Field>
            <Field label="Timezone"><Select value={f.timezone} onChange={set('timezone')} disabled={!owner}>{timezones.map((z) => <option key={z}>{z}</option>)}</Select></Field>
          </div>
        </CardBody></Card>
      </Section>
      <Section title="Opening hours">
        <Card><CardBody className="space-y-2">
          {hours.length === 0 && <p className="text-[13px] text-muted-foreground">No hours added yet.</p>}
          {hours.map((h, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="e.g. Mon–Sat" value={h.label} disabled={!owner} onChange={(e) => setHours(hours.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <Input placeholder="e.g. 9am–9pm" value={h.value} disabled={!owner} onChange={(e) => setHours(hours.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              {owner && <IconButton label="Remove row" tone="danger" className="size-9" onClick={() => setHours(hours.filter((_, j) => j !== i))}><Trash2 /></IconButton>}
            </div>
          ))}
          {owner && <Button type="button" size="sm" variant="ghost" className="-ml-2" onClick={() => setHours([...hours, { label: '', value: '' }])}><Plus className="size-3.5" />Add hours</Button>}
        </CardBody></Card>
      </Section>
      <Section title="Payments and alerts">
        <Card>
          <CardBody className="space-y-4">
            <Field label="How customers pay"><Input value={f.paymentInfo} onChange={set('paymentInfo')} disabled={!owner} /></Field>
            <Field label="Return policy"><Textarea rows={2} value={f.returnPolicy} onChange={set('returnPolicy')} disabled={!owner} /></Field>
            <Field label="Your WhatsApp number for alerts" hint="Digits with country code, e.g. 2348012345678"><Input inputMode="numeric" value={f.ownerPhone} onChange={set('ownerPhone')} disabled={!owner} /></Field>
          </CardBody>
          {owner && <CardFooter><Button type="submit" loading={busy}>Save changes</Button></CardFooter>}
        </Card>
      </Section>
    </form>
  );
}

/* ---------------- Delivery zones ---------------- */
function Delivery() {
  const money = useMoney();
  const labels = useLabels();
  const toast = useToast();
  const { data: zones, isLoading } = useApi<Zone[]>('delivery-zones');
  const [target, setTarget] = useState<Zone | 'new' | null>(null);
  const [seed, setSeed] = useState<unknown>(null);
  const [f, setF] = useState({ areaName: '', fee: '', etaText: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const z = target && target !== 'new' ? target : null;
  if (target !== seed) { setSeed(target); setErr(null); setF(z ? { areaName: z.areaName, fee: money.toInput(z.feeMinor), etaText: z.etaText } : { areaName: '', fee: '', etaText: '' }); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const feeMinor = money.parse(f.fee);
    if (feeMinor === null) return setErr(`Enter a valid fee in ${money.currency}, e.g. ${money.example}`);
    setBusy(true); setErr(null);
    try {
      const body = { areaName: f.areaName.trim(), feeMinor, etaText: f.etaText.trim() };
      if (z) await api.patch(`delivery-zones/${z.id}`, body); else await api.post('delivery-zones', body);
      await Promise.all([mutate('delivery-zones'), mutate('business')]); toast('Delivery area saved'); setTarget(null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api.delete(`delivery-zones/${id}`); await Promise.all([mutate('delivery-zones'), mutate('business')]); toast('Delivery area removed'); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title={labels.zones} action={<Button size="sm" onClick={() => setTarget('new')}><Plus className="size-3.5" />Add area</Button>} />
      {isLoading ? <Loading /> : !zones?.length ? <EmptyState icon={<MapPin />} title={`No ${labels.zones.toLowerCase()} yet`} /> : (
        <Table>
          <THead><tr><TH>Area</TH><TH>Delivery time</TH><TH className="text-right">Fee</TH><TH className="w-20"><span className="sr-only">Actions</span></TH></tr></THead>
          <tbody>
            {zones.map((x) => (
              <TR key={x.id}>
                <TD className="font-medium">{x.areaName}</TD><TD className="text-[13px] text-muted-foreground">{x.etaText}</TD><TD className="text-right font-medium tabular-nums">{money.fmt(x.feeMinor)}</TD>
                <TD><div className="flex justify-end gap-0.5"><IconButton label={`Edit ${x.areaName}`} onClick={() => setTarget(x)}><Pencil /></IconButton><IconButton label={`Delete ${x.areaName}`} tone="danger" onClick={() => remove(x.id)}><Trash2 /></IconButton></div></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <Dialog open={!!target} onClose={() => setTarget(null)} title={z ? 'Edit delivery area' : 'Add delivery area'}
        footer={<><Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button><Button type="submit" form="zone-form" loading={busy}>Save</Button></>}>
        <form id="zone-form" onSubmit={submit} className="space-y-4">
          {err && <ErrorNote>{err}</ErrorNote>}
          <Field label="Area"><Input required value={f.areaName} onChange={(e) => setF({ ...f, areaName: e.target.value })} placeholder="e.g. Downtown" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${labels.fee} (${money.currency})`}><Input required inputMode="decimal" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>
            <Field label="Delivery time"><Input required value={f.etaText} onChange={(e) => setF({ ...f, etaText: e.target.value })} placeholder="45–60 minutes" /></Field>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

/* ---------------- FAQs ---------------- */
function Faqs() {
  const toast = useToast();
  const { data: faqs, isLoading } = useApi<Faq[]>('faqs');
  const [target, setTarget] = useState<Faq | 'new' | null>(null);
  const [seed, setSeed] = useState<unknown>(null);
  const [f, setF] = useState({ question: '', answer: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = target && target !== 'new' ? target : null;
  if (target !== seed) { setSeed(target); setErr(null); setF(q ? { question: q.question, answer: q.answer } : { question: '', answer: '' }); }

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (q) await api.patch(`faqs/${q.id}`, f); else await api.post('faqs', f);
      await Promise.all([mutate('faqs'), mutate('business')]); toast('FAQ saved'); setTarget(null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api.delete(`faqs/${id}`); await Promise.all([mutate('faqs'), mutate('business')]); toast('FAQ removed'); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <Card>
      <CardHeader title="Frequently asked questions" action={<Button size="sm" onClick={() => setTarget('new')}><Plus className="size-3.5" />Add FAQ</Button>} />
      {isLoading ? <Loading /> : !faqs?.length ? <EmptyState icon={<HelpCircle />} title="No FAQs yet" /> : (
        <ul className="stagger divide-y divide-border/60 border-t">
          {faqs.map((x) => (
            <li key={x.id} className="group flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0"><div className="text-sm font-medium">{x.question}</div><p className="mt-1 whitespace-pre-wrap text-[13px] text-muted-foreground">{x.answer}</p></div>
              <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100"><IconButton label="Edit FAQ" onClick={() => setTarget(x)}><Pencil /></IconButton><IconButton label="Delete FAQ" tone="danger" onClick={() => remove(x.id)}><Trash2 /></IconButton></div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!target} onClose={() => setTarget(null)} title={q ? 'Edit FAQ' : 'Add FAQ'}
        footer={<><Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button><Button type="submit" form="faq-form" loading={busy}>Save</Button></>}>
        <form id="faq-form" onSubmit={submit} className="space-y-4">
          {err && <ErrorNote>{err}</ErrorNote>}
          <Field label="Question"><Input required minLength={3} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} /></Field>
          <Field label="Answer"><Textarea required rows={4} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} /><SuggestButton field="faq_answer" text={f.answer} context={f.question} onUse={(v) => setF({ ...f, answer: v })} /></Field>
        </form>
      </Dialog>
    </Card>
  );
}

/* ---------------- WhatsApp ---------------- */
function Whatsapp({ biz, owner }: { biz: BusinessDetail; owner: boolean }) {
  const toast = useToast();
  const account = biz.whatsappAccounts[0];
  const [f, setF] = useState({ wabaId: '', phoneNumberId: '', displayNumber: '', accessToken: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.put('business/whatsapp', f); await mutate('business'); setF({ wabaId: '', phoneNumberId: '', displayNumber: '', accessToken: '' }); toast('WhatsApp number connected'); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function disconnect() {
    try { await api.delete('business/whatsapp'); await mutate('business'); toast('WhatsApp number disconnected'); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Connected number" />
        <CardBody>
          {account ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl border bg-success-bg text-success"><Plug className="size-4" /></span><div><div className="flex items-center gap-3 text-sm font-medium">+{account.displayNumber}<StatusDot tone="success">Active</StatusDot></div><div className="text-xs text-muted-foreground">Phone number ID {account.phoneNumberId}</div></div></div>
              {owner && <Button variant="secondary" size="sm" onClick={disconnect}><Unplug className="size-3.5" />Disconnect</Button>}
            </div>
          ) : <p className="text-[13px] text-muted-foreground">Not connected</p>}
        </CardBody>
      </Card>
      {owner && (
        <form onSubmit={connect}>
          <Card>
            <CardHeader title={account ? 'Replace number' : 'Connect a number'} description="From Meta Business → WhatsApp → API setup" />
            <CardBody className="space-y-4">
              {err && <ErrorNote>{err}</ErrorNote>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="WhatsApp Business Account ID"><Input required value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value })} /></Field>
                <Field label="Phone number ID"><Input required value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value })} /></Field>
              </div>
              <Field label="Phone number"><Input required inputMode="numeric" value={f.displayNumber} onChange={(e) => setF({ ...f, displayNumber: e.target.value })} placeholder="14155550123" /></Field>
              <Field label="Access token" hint="Stored encrypted"><Input required type="password" autoComplete="off" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} /></Field>
            </CardBody>
            <CardFooter><Button type="submit" loading={busy}><Plug className="size-4" />Connect number</Button></CardFooter>
          </Card>
        </form>
      )}
    </div>
  );
}

/* ---------------- Data & privacy ---------------- */
function DataPrivacy({ biz, owner }: { biz: BusinessDetail; owner: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportData() {
    try {
      const data = await api.get<unknown>('business/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `${biz.slug}-export.json`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function destroy() {
    setBusy(true); setErr(null);
    try { await api.delete('business', { confirm }); await api.post('auth/logout').catch(() => {}); router.replace('/signup'); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  if (!owner) return <ErrorNote>Only the account owner can export or delete business data.</ErrorNote>;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Export your data" />
        <CardBody><Button variant="secondary" onClick={exportData}><Download className="size-4" />Download export</Button></CardBody>
      </Card>
      <Card className="border-danger/30">
        <CardHeader title="Delete this business" description="Deletes everything. Can't be undone." />
        <CardBody><Button variant="danger" onClick={() => setOpen(true)}>Delete business…</Button></CardBody>
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete business permanently?" description={`Type ${biz.slug} to confirm.`}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" disabled={confirm !== biz.slug} loading={busy} onClick={destroy}>Delete everything</Button></>}>
        <div className="space-y-3">{err && <ErrorNote>{err}</ErrorNote>}<Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={biz.slug} /></div>
      </Dialog>
    </div>
  );
}
