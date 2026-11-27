'use client';
import { useState } from 'react';
import { Card, CardBody, CardHeader, EmptyState, Loading, PageHeader, Select, Stat } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { Analytics } from '@/lib/types';
import { formatNaira } from '@/lib/utils';

function BarChart({ data, format }: { data: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = Math.ceil(data.length / 6);
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Bar chart">
        {data.map((d) => (
          <div key={d.label} className="group relative flex h-full flex-1 items-end">
            <div className="w-full rounded-t-sm bg-primary/85 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(d.value > 0 ? 3 : 0, (d.value / max) * 100)}%` }} />
            <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground group-hover:block">{d.label}: {format(d.value)}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[3px] text-[11px] text-muted-foreground">
        {data.map((d, i) => <div key={d.label} className="flex-1 overflow-visible whitespace-nowrap">{i % step === 0 ? d.label : ''}</div>)}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState('30');
  const { data, isLoading } = useApi<Analytics>(`analytics/overview?days=${days}`, { refreshInterval: 30000 });
  const label = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <>
      <PageHeader title="Analytics" description="How your WhatsApp sales are doing."
        actions={<Select value={days} onChange={(e) => setDays(e.target.value)} className="w-40" aria-label="Date range"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></Select>} />
      {isLoading || !data ? <Loading /> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Stat label="Active chats" value={data.conversations} />
            <Stat label="Orders" value={data.orders} hint={data.conversionPct === null ? undefined : `${data.conversionPct}% of chats`} />
            <Stat label="Revenue (paid)" value={formatNaira(data.revenueKobo)} hint={`${data.paidOrders} paid orders`} />
            <Stat label="Handled by AI" value={data.aiHandledPct === null ? '—' : `${data.aiHandledPct}%`} hint="Chats that never needed a human" />
            <Stat label="AI replies" value={data.aiRuns} />
            <Stat label="AI cost" value={`$${Number(data.aiCostUsd).toFixed(2)}`} hint="Model usage in this period" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader title="Orders per day" /><CardBody><BarChart data={data.series.map((s) => ({ label: label(s.date), value: s.orders }))} format={(n) => `${n} orders`} /></CardBody></Card>
            <Card><CardHeader title="Revenue per day" description="Paid orders only" /><CardBody><BarChart data={data.series.map((s) => ({ label: label(s.date), value: s.revenueKobo }))} format={formatNaira} /></CardBody></Card>
          </div>
          <Card>
            <CardHeader title="Best sellers" />
            {data.topProducts.length === 0 ? <EmptyState title="No sales in this period" description="Your top products will show up here once orders come in." /> : (
              <ul className="divide-y">
                {data.topProducts.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-4 px-5 py-3">
                    <span className="w-5 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="flex-1 text-sm font-medium">{p.name}</span>
                    <span className="text-[13px] text-muted-foreground tabular-nums">{p.quantity} sold</span>
                    <span className="w-28 text-right text-sm font-medium tabular-nums">{formatNaira(p.revenueKobo)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
