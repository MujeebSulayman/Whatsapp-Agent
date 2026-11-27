'use client';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, Loading, PageHeader } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { BusinessDetail } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function OnboardingPage() {
  const { data: biz } = useApi<BusinessDetail>('business');
  if (!biz) return <Loading />;
  const steps = [
    { done: biz.setup.whatsapp, title: 'Connect your WhatsApp number', body: 'Your customers message this number and the assistant answers for you.', href: '/business?tab=whatsapp', cta: 'Connect number' },
    { done: biz.setup.products, title: 'Add your products', body: 'Add them one by one or import a spreadsheet (CSV). The assistant only quotes prices from here.', href: '/products', cta: 'Add products' },
    { done: biz.setup.zones, title: 'Set your delivery areas and fees', body: 'So the assistant can quote delivery fees and times by area.', href: '/business?tab=delivery', cta: 'Add delivery areas' },
    { done: biz.setup.faqs, title: 'Add common questions', body: 'Opening hours, returns, how to pay. The assistant answers these in your voice.', href: '/business?tab=faqs', cta: 'Add FAQs' },
    { done: !!biz.aiRules && (biz.aiRules.customInstructions !== null || biz.aiRules.maxDiscountPct > 0), title: 'Set your rules', body: 'Choose the maximum discount, topics to avoid and when to hand a chat to you.', href: '/ai-settings', cta: 'Review AI settings' }
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Welcome, ${biz.name}`} description="Five quick steps and your assistant is ready to take orders." />
      <div className="mb-6 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
        <span className="text-xs text-muted-foreground">{done} of {steps.length} done</span>
      </div>
      <Card className="divide-y">
        {steps.map((s, i) => (
          <div key={s.title} className="flex items-center gap-4 p-5">
            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium', s.done ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              {s.done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{s.title}</div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{s.body}</p>
            </div>
            {s.done ? <Badge tone="success">Done</Badge> : <Link href={s.href}><Button size="sm" variant="secondary">{s.cta}<ArrowRight className="size-3.5" /></Button></Link>}
          </div>
        ))}
      </Card>
      {done === steps.length && <div className="mt-6 text-center"><Link href="/inbox"><Button>Go to your inbox</Button></Link></div>}
      <p className="mt-6 text-center text-xs text-muted-foreground">You can change any of this later under Configure.</p>
    </div>
  );
}
