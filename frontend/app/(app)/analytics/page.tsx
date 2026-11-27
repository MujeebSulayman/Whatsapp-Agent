'use client';
import { Bot, Gauge, MessageSquare, ShoppingBag, Sparkles, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card, CardHeader, EmptyState, Loading, PageHeader, Select, StatGrid } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { Analytics } from '@/lib/types';
import { useLabels } from '@/lib/use-labels';
import { useMoney } from '@/lib/use-money';
import { cn } from '@/lib/utils';

function BarChart({ data, format }: { data: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = Math.ceil(data.length / 6);
  return (
    <div>
      <div className="relative h-40">
        {/* Faint guide lines at 0, 50% and 100% of the busiest day */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
          {[0, 1, 2].map((i) => <div key={i} className="border-t border-dashed border-border/70" />)}
        </div>
        <div className="relative flex h-full items-end gap-[3px]" role="img" aria-label="Bar chart">
          {data.map((d, i) => (
            <div key={d.label} className="group relative flex h-full flex-1 items-end">
              {/* Bars grow up from the baseline, left to right, when the chart first appears */}
              <div className={cn('animate-grow-y w-full rounded-[3px] transition-colors', d.value > 0 ? 'bg-brand/70 group-hover:bg-brand' : 'h-[2px] bg-border')}
                style={{ animationDelay: `${i * 12}ms`, ...(d.value > 0 ? { height: `${Math.max(3, (d.value / max) * 100)}%` } : {}) }} />
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-xs opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100">
                <span className="text-muted-foreground">{d.label}</span> <span className="font-medium tabular-nums">{format(d.value)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-[3px] text-[11px] text-muted-foreground">
        {data.map((d, i) => <div key={d.label} className="flex-1 overflow-visible whitespace-nowrap">{i % step === 0 ? d.label : ''}</div>)}
      </div>
    </div>
  );
}

/* Chart card: the period total sits under the title so the chart has a headline number. */
function ChartCard({ title, total, children }: { title: string; total: string; children: ReactNode }) {
  return (
    <Card>
      <div className="px-5 pt-4">
        <h2 className="text-[13px] text-muted-foreground">{title}</h2>
        <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{total}</div>
      </div>
      <div className="px-5 pt-5 pb-4">{children}</div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const money = useMoney();
  const labels = useLabels();
  const [days, setDays] = useState('30');
  const { data, isLoading } = useApi<Analytics>(`analytics/overview?days=${days}`, { refreshInterval: 30000 });
  const totalOrders = data?.series.reduce((n, s) => n + s.orders, 0) ?? 0;
  const totalRevenue = data?.series.reduce((n, s) => n + s.revenueMinor, 0) ?? 0;
  const topRevenue = Math.max(1, ...(data?.topProducts.map((p) => p.revenueMinor) ?? []));
  const label = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <>
      <PageHeader title="Analytics" description="How your WhatsApp sales are doing."
        actions={<Select value={days} onChange={(e) => setDays(e.target.value)} className="w-40" aria-label="Date range"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></Select>} />
      {isLoading || !data ? <Loading /> : (
        <div className="space-y-4">
          <StatGrid className="sm:grid-cols-2 xl:grid-cols-3" stats={[
            { label: 'Active chats', value: data.conversations, icon: MessageSquare },
            { label: labels.orders, value: data.orders, icon: ShoppingBag, hint: data.conversionPct === null ? undefined : `${data.conversionPct}% of chats` },
            { label: 'Revenue (paid)', value: money.fmt(data.revenueMinor), icon: Wallet, hint: `${data.paidOrders} paid orders` },
            { label: 'Handled by AI', value: data.aiHandledPct === null ? '—' : `${data.aiHandledPct}%`, icon: Sparkles, hint: 'Chats that never needed a human' },
            { label: 'AI replies', value: data.aiRuns, icon: Bot },
            { label: 'Average order', value: data.paidOrders === 0 ? '—' : money.fmt(Math.round(data.revenueMinor / data.paidOrders)), icon: Gauge, hint: 'Paid orders only' }
          ]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={`${labels.orders} per day`} total={`${totalOrders}`}>
              <BarChart data={data.series.map((s) => ({ label: label(s.date), value: s.orders }))} format={(n) => `${n} ${n === 1 ? 'order' : 'orders'}`} />
            </ChartCard>
            <ChartCard title="Revenue per day · paid only" total={money.fmt(totalRevenue)}>
              <BarChart data={data.series.map((s) => ({ label: label(s.date), value: s.revenueMinor }))} format={money.fmt} />
            </ChartCard>
          </div>
          <Card>
            <CardHeader title="Best sellers" description="Ranked by revenue in this period" />
            {data.topProducts.length === 0 ? <EmptyState title="No sales in this period" description="Your top products will show up here once orders come in." /> : (
              <ul className="stagger px-2 pb-2">
                {data.topProducts.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-4 rounded-lg px-3 py-2.5 hover:bg-muted/40">
                    <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                        <div className="animate-grow-x h-full rounded-full bg-brand/70" style={{ width: `${(p.revenueMinor / topRevenue) * 100}%`, animationDelay: `${150 + i * 60}ms` }} />
                      </div>
                    </div>
                    <span className="w-16 text-right text-[13px] text-muted-foreground tabular-nums">{p.quantity} sold</span>
                    <span className="w-24 text-right text-sm font-medium tabular-nums">{money.fmt(p.revenueMinor)}</span>
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
