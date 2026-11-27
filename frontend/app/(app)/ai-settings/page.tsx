'use client';
import { Bot, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Card, CardBody, CardFooter, ErrorNote, Field, Input, Loading, PageHeader, Section, Select, StatGrid, Switch, Textarea, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { api, useApi, useMe } from '@/lib/api';
import { SuggestButton } from '@/components/setup/suggest-button';
import type { BusinessDetail } from '@/lib/types';

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function AiSettingsPage() {
  const toast = useToast();
  const { data: biz, mutate: refresh } = useApi<BusinessDetail>('business');
  const { data: me } = useMe();
  const [f, setF] = useState<{ tone: string; max: string; escalate: string; forbidden: string; instructions: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (biz && !f) setF({ tone: biz.tone, max: String(biz.aiRules?.maxDiscountPct ?? 0), escalate: (biz.aiRules?.escalateKeywords ?? []).join(', '), forbidden: (biz.aiRules?.forbiddenTopics ?? []).join(', '), instructions: biz.aiRules?.customInstructions ?? '' });
  if (!biz || !f) return <Loading />;
  const owner = me?.role === 'owner';
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => s && { ...s, [k]: e.target.value });

  async function toggle(aiEnabled: boolean) {
    try { await api.patch('business', { aiEnabled }); await refresh(); toast(aiEnabled ? 'AI assistant is on' : 'AI assistant is off. Customers will not get automatic replies.'); }
    catch (e) { toast((e as Error).message, 'error'); }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const max = Number(f!.max);
    if (!Number.isInteger(max) || max < 0 || max > 50) return setErr('Maximum discount must be a whole number from 0 to 50');
    setBusy(true); setErr(null);
    try {
      await api.patch('business', { tone: f!.tone });
      await api.put('business/ai-rules', { maxDiscountPct: max, escalateKeywords: list(f!.escalate), forbiddenTopics: list(f!.forbidden), customInstructions: f!.instructions.trim() || null });
      await refresh(); toast('AI settings saved');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="AI assistant" description="Control how your assistant talks to customers and what it is allowed to do." />
      {!owner && <div className="mb-4"><ErrorNote>Only the account owner can change these settings.</ErrorNote></div>}
      <Section title="Status" description="Turn automatic replies off to answer every chat yourself.">
        <Card className="flex items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', biz.aiEnabled ? 'bg-brand shadow-[0_0_0_3px] shadow-brand/20' : 'bg-muted-foreground')} />
            <div>
              <div className="text-sm font-medium">{biz.aiEnabled ? 'Automatic replies are on' : 'Automatic replies are paused'}</div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{biz.aiEnabled ? 'The assistant is answering your customers on WhatsApp.' : 'New messages wait for you in the inbox.'}</p>
            </div>
          </div>
          <Switch checked={biz.aiEnabled} onChange={toggle} disabled={!owner} label="Automatic replies" />
        </Card>
      </Section>

      <Section title="Style and rules" description="Given to the assistant before every reply.">
        <form onSubmit={save}>
          <Card>
            <CardBody className="space-y-5">
              {err && <ErrorNote>{err}</ErrorNote>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tone"><Select value={f.tone} onChange={set('tone')} disabled={!owner}>{['friendly', 'professional', 'playful', 'formal'].map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}</Select></Field>
                <Field label="Maximum discount (%)" hint="Never goes above this. 0 means no discounts."><Input inputMode="numeric" value={f.max} onChange={set('max')} disabled={!owner} /></Field>
              </div>
              <Field label="Hand over to you when a customer says…" hint="Separate with commas. A chat containing these words is flagged for you."><Input value={f.escalate} onChange={set('escalate')} disabled={!owner} placeholder="refund, complaint, lawyer" /></Field>
              <Field label="Topics the assistant must avoid" hint="Separate with commas."><Input value={f.forbidden} onChange={set('forbidden')} disabled={!owner} placeholder="politics, religion" /></Field>
              <Field label="Extra instructions" hint="Anything specific to your business, e.g. “Custom orders need 7 days notice.”"><Textarea rows={4} value={f.instructions} onChange={set('instructions')} disabled={!owner} maxLength={1500} />{owner && <SuggestButton field="instructions" text={f.instructions} onUse={(v) => setF({ ...f, instructions: v.slice(0, 1500) })} />}</Field>
            </CardBody>
            {owner && <CardFooter><Button type="submit" loading={busy}>Save changes</Button></CardFooter>}
          </Card>
        </form>
      </Section>

      <Section title="Usage this month" description="Resets on the 1st.">
        <StatGrid className="sm:grid-cols-2" stats={[
          { label: 'AI replies', value: biz.usage.aiReplies, icon: Bot },
          { label: 'WhatsApp messages sent', value: biz.usage.waMessagesBilled, icon: Send, hint: 'The first 1,000 each month are free from WhatsApp.' }
        ]} />
      </Section>
    </div>
  );
}
