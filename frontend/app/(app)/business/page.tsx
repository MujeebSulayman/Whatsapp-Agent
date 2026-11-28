'use client';
import { Download, HelpCircle, MapPin, Pencil, Plus, Plug, Trash2, Unplug } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { mutate } from 'swr';
import { FaqList } from '@/components/faq-list';
import { DeliveryZones } from '@/components/delivery-zones';
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
      {tab === 'delivery' && <DeliveryZones />}
      {tab === 'faqs' && <FaqList />}
      {tab === 'payments' && <PayoutCard owner={owner} />}
      {tab === 'whatsapp' && <Whatsapp biz={biz} owner={owner} />}
      {tab === 'data' && <DataPrivacy biz={biz} owner={owner} />}
    </div>
  );
}

/* ---------------- Profile ---------------- */
function Profile({ biz, owner }: { biz: BusinessDetail; owner: boolean }) {
  const toast = useToast();
  const [f, setF] = useState({ name: biz.name, category: biz.category, city: biz.city, kind: biz.kind, country: biz.country, currency: biz.currency, timezone: biz.timezone});
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currencies = useMemo(() => currencyOptions(), []);
  const timezones = useMemo(() => timezoneOptions(), []);
  const currencyLocked = biz.setup.products || biz.setup.zones;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.patch('business', {
        name: f.name.trim(), category: f.category.trim(), kind: f.kind, city: f.city.trim(), country: f.country, timezone: f.timezone, ...(f.currency !== biz.currency ? { currency: f.currency } : {}),
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
      {owner && <div className="mb-6"><Card><CardBody className="flex items-center justify-between gap-3 text-[13px]"><span>Opening hours, payments, returns and your alert number are in Finish setup.</span><Button type="button" size="sm" variant="secondary" onClick={() => router.push('/finish-setup')}>Open</Button></CardBody></Card></div>}
      {owner && <div><Button type="submit" loading={busy}>Save changes</Button></div>}
    </form>
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
