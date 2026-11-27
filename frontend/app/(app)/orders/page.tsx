'use client';
import { ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { mutate } from 'swr';
import { OrderBadge, PaymentBadge } from '@/components/badges';
import { Button, Card, Dialog, EmptyState, ErrorNote, Input, Loading, PageHeader, Table, Tabs, TD, TH, THead, TR, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { Order, OrderStatus } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { useMoney } from '@/lib/use-money';

type Filter = 'all' | OrderStatus;
const tabs: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'pending', label: 'Pending' }, { id: 'paid', label: 'Paid' }, { id: 'dispatched', label: 'Dispatched' }, { id: 'delivered', label: 'Delivered' }, { id: 'cancelled', label: 'Cancelled' }];

export default function OrdersPage() {
  const money = useMoney();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const qs = new URLSearchParams({ ...(filter !== 'all' ? { status: filter } : {}), ...(search ? { search } : {}) }).toString();
  const key = `orders${qs ? `?${qs}` : ''}`;
  const { data: orders, isLoading } = useApi<Order[]>(key, { refreshInterval: 8000 });

  return (
    <>
      <PageHeader title="Orders" description="Orders the assistant captured from WhatsApp chats." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onChange={setFilter} tabs={tabs} />
        <Input className="w-64" placeholder="Search customer or order ID" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Card>
        {isLoading ? <Loading /> : !orders?.length ? (
          <EmptyState icon={<ShoppingBag className="size-5" />} title="No orders yet" description="Orders show up here as soon as the assistant takes one from a customer." />
        ) : (
          <Table>
            <THead><tr><TH>Order</TH><TH>Customer</TH><TH>Items</TH><TH>Total</TH><TH>Payment</TH><TH>Status</TH><TH>Placed</TH></tr></THead>
            <tbody>
              {orders.map((o) => (
                <TR key={o.id} onClick={() => setOpenId(o.id)}>
                  <TD className="font-mono text-xs">#{o.id.slice(-6).toUpperCase()}</TD>
                  <TD>{o.customer?.name ?? `+${o.customer?.waId}`}</TD>
                  <TD className="tabular-nums">{o.items.reduce((n, i) => n + i.quantity, 0)}</TD>
                  <TD className="font-medium tabular-nums">{money.fmt(o.totalMinor)}</TD>
                  <TD><PaymentBadge status={o.paymentStatus} /></TD>
                  <TD><OrderBadge status={o.status} /></TD>
                  <TD className="text-muted-foreground">{formatDateTime(o.createdAt)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <OrderDialog id={openId} onClose={() => setOpenId(null)} listKey={key} />
    </>
  );
}

function OrderDialog({ id, onClose, listKey }: { id: string | null; onClose: () => void; listKey: string }) {
  const money = useMoney();
  const toast = useToast();
  const { data: o, mutate: refresh } = useApi<Order>(id ? `orders/${id}` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function run(name: string, fn: () => Promise<unknown>, done: string) {
    setBusy(name); setErr(null);
    try { await fn(); await Promise.all([refresh(), mutate(listKey)]); toast(done); setConfirmCancel(false); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  const setStatus = (status: string) => api.patch(`orders/${id}/status`, { status });
  const closed = o?.status === 'cancelled' || o?.status === 'delivered';

  return (
    <Dialog open={!!id} onClose={() => { setErr(null); setConfirmCancel(false); onClose(); }} wide title={o ? `Order #${o.id.slice(-6).toUpperCase()}` : 'Order'} description={o ? `Placed ${formatDateTime(o.createdAt)}` : undefined}
      footer={o && !closed && (
        <>
          {confirmCancel ? (
            <>
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep order</Button>
              <Button variant="danger" loading={busy === 'cancel'} onClick={() => run('cancel', () => setStatus('cancelled'), 'Order cancelled')}>Yes, cancel order</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel order</Button>
              {o.paymentStatus !== 'paid' && <Button variant="secondary" loading={busy === 'paid'} onClick={() => run('paid', () => api.post(`orders/${id}/mark-paid`), 'Marked as paid')}>Mark as paid</Button>}
              {o.status !== 'dispatched' && <Button variant={o.paymentStatus === 'paid' ? 'primary' : 'secondary'} loading={busy === 'dispatch'} onClick={() => run('dispatch', () => setStatus('dispatched'), 'Marked as dispatched')}>Mark dispatched</Button>}
              {o.status === 'dispatched' && <Button loading={busy === 'deliver'} onClick={() => run('deliver', () => setStatus('delivered'), 'Marked as delivered')}>Mark delivered</Button>}
            </>
          )}
        </>
      )}>
      {!o ? <Loading /> : (
        <div className="space-y-5">
          {err && <ErrorNote>{err}</ErrorNote>}
          <div className="flex flex-wrap items-center gap-2"><OrderBadge status={o.status} /><PaymentBadge status={o.paymentStatus} /></div>
          <div className="grid gap-4 text-[13px] sm:grid-cols-2">
            <div><div className="text-muted-foreground">Customer</div><div className="mt-0.5 font-medium">{o.customer?.name ?? '—'}</div><div>+{o.customer?.waId}</div></div>
            <div><div className="text-muted-foreground">Delivery address</div><div className="mt-0.5">{o.address ?? '—'}</div>{o.notes && <div className="mt-1 text-muted-foreground">Note: {o.notes}</div>}</div>
          </div>
          <div className="rounded-md border">
            <Table>
              <THead><tr><TH className="py-2">Item</TH><TH className="py-2 text-right">Qty</TH><TH className="py-2 text-right">Amount</TH></tr></THead>
              <tbody>
                {o.items.map((i, n) => (
                  <TR key={n}><TD className="py-2">{i.name}{i.variant ? ` (${i.variant})` : ''}</TD><TD className="py-2 text-right tabular-nums">{i.quantity}</TD><TD className="py-2 text-right tabular-nums">{money.fmt(i.line_total_minor)}</TD></TR>
                ))}
              </tbody>
            </Table>
            <dl className="space-y-1.5 border-t bg-muted/30 px-5 py-3 text-[13px]">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{money.fmt(o.subtotalMinor)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd className="tabular-nums">{money.fmt(o.deliveryFeeMinor)}</dd></div>
              {o.discountMinor > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">−{money.fmt(o.discountMinor)}</dd></div>}
              <div className="flex justify-between border-t pt-2 text-sm font-semibold"><dt>Total</dt><dd className="tabular-nums">{money.fmt(o.totalMinor)}</dd></div>
            </dl>
          </div>
        </div>
      )}
    </Dialog>
  );
}
