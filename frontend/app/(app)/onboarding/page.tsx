'use client';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, Loading, PageHeader, StatusDot } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { BusinessDetail } from '@/lib/types';
import { useLabels } from '@/lib/use-labels';
import { cn } from '@/lib/utils';

export default function OnboardingPage() {
  const { data: biz } = useApi<BusinessDetail>('business');
  const labels = useLabels();
  if (!biz) return <Loading />;
  const steps = [
    { done: biz.setup.whatsapp, title: 'Connect your WhatsApp number', body: 'Your customers message this number and the assistant answers for you.', href: '/business?tab=whatsapp', cta: 'Connect number' },
    { done: biz.setup.products, title: `Add your ${labels.items.toLowerCase()}`, body: 'Add them one by one or import a spreadsheet (CSV). The assistant only quotes prices from here.', href: '/products', cta: labels.addItem },
    { done: biz.setup.zones, title: `Set your ${labels.zones.toLowerCase()} and fees`, body: labels.kind === 'services' ? 'So the assistant knows where you work and what to charge for a call-out.' : 'So the assistant can quote delivery fees and times by area.', href: '/business?tab=delivery', cta: `Add ${labels.zones.toLowerCase()}` },
    { done: biz.setup.faqs, title: 'Add common questions', body: 'Opening hours, returns, how to pay. The assistant answers these in your voice.', href: '/business?tab=faqs', cta: 'Add FAQs' },
    { done: !!biz.aiRules && (biz.aiRules.customInstructions !== null || biz.aiRules.maxDiscountPct > 0), title: 'Set your rules', body: 'Choose the maximum discount, topics to avoid and when to hand a chat to you.', href: '/ai-settings', cta: 'Review AI settings' }
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Welcome, ${biz.name}`} />
      <div className="mb-6 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
        <span className="text-xs text-muted-foreground tabular-nums">{done} of {steps.length} done</span>
      </div>
      <Link href="/setup" className="mb-4 flex items-center gap-4 rounded-xl border border-brand/25 bg-brand/5 p-5 transition-colors hover:bg-brand/10">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand"><Sparkles className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Set up with AI</div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Paste a price list or drop a photo.</p>
        </div>
        <ArrowRight className="size-4 text-muted-foreground" />
      </Link>
      <Card className="stagger divide-y divide-border/60">
        {steps.map((s, i) => (
          <div key={s.title} className="flex items-center gap-4 px-5 py-4">
            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums', s.done ? 'border-brand/40 bg-brand/15 text-brand' : 'text-muted-foreground')}>
              {s.done ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className={cn('text-sm font-medium', s.done && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{s.title}</div>
            </div>
            {s.done ? <StatusDot tone="success">Done</StatusDot> : <Link href={s.href}><Button size="sm" variant="secondary">{s.cta}<ArrowRight className="size-3.5" /></Button></Link>}
          </div>
        ))}
      </Card>
      {done === steps.length && <div className="mt-6 text-center"><Link href="/inbox"><Button>Go to your inbox</Button></Link></div>}
      
    </div>
  );
}
