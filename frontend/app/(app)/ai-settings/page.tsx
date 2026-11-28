'use client';
import { Bot, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PracticePanel } from '@/components/setup/practice-panel';
import { SuggestButton } from '@/components/setup/suggest-button';
import { Button, Card, CardBody, CardHeader, ErrorNote, Loading, Notice, PageHeader, Segmented, StatGrid, Switch, TagInput, Textarea, useToast } from '@/components/ui';
import { api, useApi, useMe } from '@/lib/api';
import type { BusinessDetail } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tone = 'friendly' | 'professional' | 'playful' | 'formal';
type Form = { tone: Tone; max: number; escalate: string[]; forbidden: string[]; instructions: string; keepCustomers: boolean };
const tones: { id: Tone; label: string }[] = [{ id: 'friendly', label: 'Friendly' }, { id: 'professional', label: 'Professional' }, { id: 'playful', label: 'Playful' }, { id: 'formal', label: 'Formal' }];

const fromBiz = (b: BusinessDetail): Form => ({
  tone: (b.tone as Tone) ?? 'friendly', max: b.aiRules?.maxDiscountPct ?? 0,
  escalate: b.aiRules?.escalateKeywords ?? [], forbidden: b.aiRules?.forbiddenTopics ?? [], instructions: b.aiRules?.customInstructions ?? '',
  keepCustomers: b.aiRules?.keepCustomers ?? true
});

export default function AiSettingsPage() {
  const toast = useToast();
  const { data: biz, mutate: refresh } = useApi<BusinessDetail>('business');
  const { data: me } = useMe();
  const [base, setBase] = useState<Form | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (biz && !f) { const v = fromBiz(biz); setBase(v); setF(v); }
  if (!biz || !f || !base) return <Loading />;
  const owner = me?.role === 'owner';
  const dirty = JSON.stringify(f) !== JSON.stringify(base);

  async function toggle(aiEnabled: boolean) {
    try { await api.patch('business', { aiEnabled }); await refresh(); toast(aiEnabled ? 'Replies on' : 'Replies paused'); }
    catch (e) { toast((e as Error).message, 'error'); }
  }
  async function save(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.patch('business', { tone: f!.tone });
      await api.put('business/ai-rules', { maxDiscountPct: f!.max, escalateKeywords: f!.escalate, forbiddenTopics: f!.forbidden, customInstructions: f!.instructions.trim() || null, keepCustomers: f!.keepCustomers });
      await refresh(); setBase(f); toast('Saved');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="AI assistant" actions={
        <div className="flex items-center gap-2.5 rounded-full border bg-card py-1.5 pl-3 pr-1.5 text-[13px]">
          <span className={cn('size-2 rounded-full transition-colors', biz.aiEnabled ? 'bg-brand shadow-[0_0_0_3px] shadow-brand/20' : 'bg-muted-foreground')} />
          <span className="font-medium">{biz.aiEnabled ? 'Replying' : 'Paused'}</span>
          <Switch checked={biz.aiEnabled} onChange={toggle} disabled={!owner} label="Automatic replies" />
        </div>
      } />
      {!owner && <Notice title="Only the owner can change these" className="mb-6" />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={save} className="stagger space-y-4">
          {err && <ErrorNote>{err}</ErrorNote>}
          <Card>
            <CardHeader title="Tone" />
            <CardBody><Segmented className="w-full [&>button]:flex-1" options={tones} value={f.tone} onChange={(tone) => owner && setF({ ...f, tone })} /></CardBody>
          </Card>

          <Card>
            <CardHeader title="Max discount" action={<span className="text-lg font-semibold tabular-nums">{f.max === 0 ? 'None' : `${f.max}%`}</span>} />
            <CardBody>
              <input type="range" min={0} max={50} step={1} value={f.max} disabled={!owner} aria-label="Maximum discount"
                onChange={(e) => setF({ ...f, max: Number(e.target.value) })} className="w-full accent-brand disabled:opacity-60" />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums"><span>0%</span><span>25%</span><span>50%</span></div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="When a customer says no" />
            <CardBody>
              <div className="flex items-start justify-between gap-4">
                <div className="text-[13px]">
                  <div className="font-medium">Try once to keep them</div>
                  <p className="mt-0.5 text-muted-foreground">If a customer says “no” or “not interested”, the assistant makes one friendly attempt: it asks what held them back or suggests something else. It never pushes after a second no. Turn this off to let them go politely.</p>
                </div>
                <Switch checked={f.keepCustomers} onChange={(keepCustomers) => owner && setF({ ...f, keepCustomers })} disabled={!owner} label="Try once to keep customers who say no" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Call me in when they say" />
            <CardBody><TagInput label="Hand-over words" value={f.escalate} onChange={(escalate) => setF({ ...f, escalate })} disabled={!owner} placeholder="refund, complaint…" /></CardBody>
          </Card>

          <Card>
            <CardHeader title="Never talk about" />
            <CardBody><TagInput label="Topics to avoid" value={f.forbidden} onChange={(forbidden) => setF({ ...f, forbidden })} disabled={!owner} placeholder="politics, religion…" /></CardBody>
          </Card>

          <Card>
            <CardHeader title="Instructions" action={<span className={cn('text-xs tabular-nums', f.instructions.length > 1400 ? 'text-warning' : 'text-muted-foreground')}>{f.instructions.length}/1500</span>} />
            <CardBody>
              <Textarea rows={5} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} disabled={!owner} maxLength={1500} placeholder="Anything it should always know" aria-label="Instructions" />
              {owner && <SuggestButton field="instructions" text={f.instructions} onUse={(v) => setF({ ...f, instructions: v.slice(0, 1500) })} />}
            </CardBody>
          </Card>

          <StatGrid className="grid-cols-2" stats={[
            { label: 'AI replies this month', value: biz.usage.aiReplies, icon: Bot },
            { label: 'Messages sent', value: biz.usage.waMessagesBilled, icon: Send }
          ]} />

          {/* Appears only when something changed */}
          {owner && dirty && (
            <div className="animate-toast-in sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border bg-card/90 py-2.5 pl-4 pr-2.5 shadow-2xl backdrop-blur-md">
              <span className="flex items-center gap-2 text-[13px] text-muted-foreground"><span className="size-1.5 rounded-full bg-warning" />Unsaved changes</span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setF(base); setErr(null); }}>Discard</Button>
                <Button type="submit" size="sm" loading={busy}>Save</Button>
              </div>
            </div>
          )}
        </form>

        <div className="lg:sticky lg:top-8"><PracticePanel /></div>
      </div>
    </>
  );
}
