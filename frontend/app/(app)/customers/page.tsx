'use client';
import { Users } from 'lucide-react';
import { useState } from 'react';
import { mutate } from 'swr';
import { OrderBadge } from '@/components/badges';
import { Button, Card, Dialog, EmptyState, ErrorNote, Field, Input, Loading, PageHeader, Switch, Table, TD, TH, THead, Textarea, TR, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { Customer, CustomerDetail } from '@/lib/types';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { useMoney } from '@/lib/use-money';

export default function CustomersPage() {
  const money = useMoney();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const key = `customers${search ? `?search=${encodeURIComponent(search)}` : ''}`;
  const { data: customers, isLoading } = useApi<Customer[]>(key);

  return (
    <>
      <PageHeader title="Customers" description="Everyone who has messaged your business." />
      <div className="mb-4"><Input className="max-w-xs" placeholder="Search name or number" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Card>
        {isLoading ? <Loading /> : !customers?.length ? (
          <EmptyState icon={<Users className="size-5" />} title="No customers yet" description="Customers are added automatically the first time they message you." />
        ) : (
          <Table>
            <THead><tr><TH>Customer</TH><TH>WhatsApp</TH><TH>Orders</TH><TH>Total spent</TH><TH>Last order</TH></tr></THead>
            <tbody>
              {customers.map((c) => (
                <TR key={c.id} onClick={() => setOpenId(c.id)}>
                  <TD className="font-medium">{c.name ?? '—'}</TD>
                  <TD className="text-muted-foreground">+{c.waId}</TD>
                  <TD className="tabular-nums">{c._count?.orders ?? 0}</TD>
                  <TD className="tabular-nums">{money.fmt(c.totalSpentMinor)}</TD>
                  <TD className="text-muted-foreground">{c.lastOrderAt ? timeAgo(c.lastOrderAt) : '—'}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <CustomerDialog id={openId} onClose={() => setOpenId(null)} listKey={key} />
    </>
  );
}

function CustomerDialog({ id, onClose, listKey }: { id: string | null; onClose: () => void; listKey: string }) {
  const money = useMoney();
  const toast = useToast();
  const { data: c, mutate: refresh } = useApi<CustomerDetail>(id ? `customers/${id}` : null);
  const [form, setForm] = useState<{ name: string; notes: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (c && (!form || (form as { id?: string }).id !== c.id)) setForm({ name: c.name ?? '', notes: c.notes ?? '', ...({ id: c.id } as object) });

  async function save() {
    if (!form || !id) return;
    setBusy(true); setErr(null);
    try { await api.patch(`customers/${id}`, { name: form.name.trim() || null, notes: form.notes.trim() || null }); await Promise.all([refresh(), mutate(listKey)]); toast('Customer saved'); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function optIn(v: boolean) {
    try { await api.patch(`customers/${id}`, { optedInMarketing: v }); await refresh(); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <Dialog open={!!id} onClose={() => { setForm(null); setErr(null); onClose(); }} wide title={c?.name ?? (c ? `+${c.waId}` : 'Customer')} description={c ? `+${c.waId} · ${money.fmt(c.totalSpentMinor)} spent` : undefined}
      footer={<Button onClick={save} loading={busy}>Save changes</Button>}>
      {!c || !form ? <Loading /> : (
        <div className="space-y-5">
          {err && <ErrorNote>{err}</ErrorNote>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Marketing messages"><div className="flex h-9 items-center gap-3"><Switch checked={c.optedInMarketing} onChange={optIn} label="Opted in to marketing" /><span className="text-[13px] text-muted-foreground">{c.optedInMarketing ? 'Opted in' : 'Not opted in'}</span></div></Field>
          </div>
          <Field label="Notes" hint="Private to your team. Also visible to the assistant."><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Order history</h3>
            {c.orders.length === 0 ? <p className="text-[13px] text-muted-foreground">No orders yet.</p> : (
              <div className="rounded-md border"><Table><tbody>
                {c.orders.map((o) => (
                  <TR key={o.id}><TD className="py-2 font-mono text-xs">#{o.id.slice(-6).toUpperCase()}</TD><TD className="py-2 text-muted-foreground">{formatDateTime(o.createdAt)}</TD><TD className="py-2 tabular-nums">{money.fmt(o.totalMinor)}</TD><TD className="py-2"><OrderBadge status={o.status} /></TD></TR>
                ))}
              </tbody></Table></div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
