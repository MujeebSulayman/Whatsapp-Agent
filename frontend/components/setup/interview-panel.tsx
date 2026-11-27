'use client';
import { CheckCircle2, Plus, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { mutate } from 'swr';
import { Button, Card, CardBody, CardHeader, ErrorNote, Field, Input, Textarea, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { BusinessDetail, InterviewDraft } from '@/lib/types';
import { useLabels } from '@/lib/use-labels';

interface Q { id: string; q: string; hint: string }

const COMMON_FIRST: Q[] = [
  { id: 'hours', q: 'When are you open?', hint: 'e.g. Monday to Saturday 9am to 9pm, closed on Sunday' },
  { id: 'pay', q: 'How do customers pay?', hint: 'e.g. Bank transfer or a card link. No cash on delivery' }
];
const GOODS: Q[] = [{ id: 'delivery', q: 'How long does delivery usually take, and when do you deliver?', hint: 'e.g. 45 to 90 minutes. We do not deliver after 8pm' }];
const SERVICES: Q[] = [
  { id: 'quote', q: 'How do you price jobs? Do you charge for a quote or a visit?', hint: 'e.g. Free quotes for big jobs. Small jobs have a fixed price. Call-out fee applies' },
  { id: 'emergency', q: 'Do you take emergency or same-day jobs? How should the assistant handle them?', hint: 'e.g. Yes, call me straight away for emergencies' },
  { id: 'area', q: 'Which areas or distances do you cover?', hint: 'e.g. Lekki, Victoria Island and Ikoyi. Nothing beyond Ajah' }
];
const COMMON_LAST: Q[] = [
  { id: 'refund', q: 'What is your refund or return policy?', hint: 'e.g. No refunds on food, but tell us within an hour if something is wrong' },
  { id: 'remember', q: 'What should the assistant always remember, or never promise?', hint: 'e.g. Party packs need 24 hours notice. Never promise a delivery time' },
  { id: 'handover', q: 'When should the assistant call you in?', hint: 'e.g. Complaints, orders over 50 packs, anything about allergies' }
];

const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
let n = 0;

export function InterviewPanel() {
  const labels = useLabels();
  const toast = useToast();
  const { data: biz } = useApi<BusinessDetail>('business');
  const questions = useMemo(() => [...COMMON_FIRST, ...(labels.kind === 'services' ? SERVICES : labels.kind === 'both' ? [...GOODS, ...SERVICES] : GOODS), ...COMMON_LAST], [labels.kind]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [d, setD] = useState<null | {
    faqs: { id: number; on: boolean; question: string; answer: string }[]; payment: string; returns: string; hours: { id: number; label: string; value: string }[];
    instructions: string; appendMode: boolean; escalate: string; avoid: string;
  }>(null);

  const existing = biz?.aiRules?.customInstructions?.trim() ?? '';
  const filled = questions.filter((q) => answers[q.id]?.trim());

  async function generate() {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<InterviewDraft>('setup-ai/interview', { answers: filled.map((q) => ({ question: q.q, answer: answers[q.id]!.trim() })) });
      setD({
        faqs: r.faqs.map((f) => ({ id: ++n, on: true, ...f })), payment: r.paymentInfo ?? '', returns: r.returnPolicy ?? '',
        hours: Object.entries(r.businessHours ?? {}).map(([label, value]) => ({ id: ++n, label, value })),
        instructions: r.customInstructions ?? '', appendMode: !!existing, escalate: r.escalateKeywords.join(', '), avoid: r.forbiddenTopics.join(', ')
      });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const finalInstructions = d ? (d.appendMode && existing ? [existing, d.instructions.trim()].filter(Boolean).join('\n') : d.instructions.trim()) : '';
  const tooLong = finalInstructions.length > 1500;

  async function save() {
    if (!d) return;
    setSaving(true); setErr(null);
    try {
      const hours = d.hours.filter((h) => h.label.trim() && h.value.trim());
      await api.post('setup-ai/apply', {
        faqs: d.faqs.filter((f) => f.on && f.question.trim() && f.answer.trim()).map((f) => ({ question: f.question.trim(), answer: f.answer.trim() })),
        profile: {
          ...(d.payment.trim() ? { paymentInfo: d.payment.trim() } : {}), ...(d.returns.trim() ? { returnPolicy: d.returns.trim() } : {}),
          ...(hours.length ? { businessHours: Object.fromEntries(hours.map((h) => [h.label.trim(), h.value.trim()])) } : {})
        },
        rules: { ...(d.instructions.trim() ? { customInstructions: finalInstructions } : {}), escalateKeywords: split(d.escalate), forbiddenTopics: split(d.avoid) }
      });
      await Promise.all(['faqs', 'business'].map((k) => mutate(k)));
      setDone(true); setD(null);
      toast('Your assistant has been updated');
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  if (done) {
    return (
      <Card><CardBody className="flex flex-col items-center gap-3 py-12 text-center">
        <CheckCircle2 className="size-9 text-success" />
        <div className="text-base font-semibold">Your assistant has been updated</div>
        <p className="max-w-md text-[13px] text-muted-foreground">Now try it out in the practice chat to see how it answers.</p>
        <div className="mt-2 flex gap-2"><Link href="/ai-settings"><Button variant="secondary">See AI settings</Button></Link><Button onClick={() => { setDone(false); setAnswers({}); }}>Answer again</Button></div>
      </CardBody></Card>
    );
  }

  if (d) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold">Check the draft</h2><p className="text-[13px] text-muted-foreground">Edit anything. Nothing changes until you press Save.</p></div>
          <Button variant="ghost" onClick={() => setD(null)}>Back to my answers</Button>
        </div>

        <Card>
          <CardHeader title={`FAQs (${d.faqs.filter((f) => f.on).length} of ${d.faqs.length})`} description="Your assistant answers these in your voice." />
          {d.faqs.length === 0 && <p className="p-5 text-[13px] text-muted-foreground">No FAQs could be drafted from your answers. Add more detail and try again.</p>}
          <div className="divide-y">
            {d.faqs.map((f) => (
              <div key={f.id} className={`flex items-start gap-3 p-3 ${f.on ? '' : 'opacity-50'}`}>
                <input type="checkbox" checked={f.on} onChange={(e) => setD({ ...d, faqs: d.faqs.map((x) => (x.id === f.id ? { ...x, on: e.target.checked } : x)) })} aria-label="Include FAQ" className="mt-2.5 size-4" />
                <div className="flex-1 space-y-1.5">
                  <Input value={f.question} onChange={(e) => setD({ ...d, faqs: d.faqs.map((x) => (x.id === f.id ? { ...x, question: e.target.value } : x)) })} aria-label="Question" />
                  <Textarea rows={2} value={f.answer} onChange={(e) => setD({ ...d, faqs: d.faqs.map((x) => (x.id === f.id ? { ...x, answer: e.target.value } : x)) })} aria-label="Answer" />
                </div>
                <button type="button" aria-label="Remove FAQ" onClick={() => setD({ ...d, faqs: d.faqs.filter((x) => x.id !== f.id) })} className="mt-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Business details" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="How customers pay"><Input value={d.payment} onChange={(e) => setD({ ...d, payment: e.target.value })} maxLength={300} /></Field>
              <Field label="Return policy"><Input value={d.returns} onChange={(e) => setD({ ...d, returns: e.target.value })} maxLength={500} /></Field>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-medium">Opening hours</div>
              <div className="space-y-2">
                {d.hours.map((h) => (
                  <div key={h.id} className="flex gap-2">
                    <Input value={h.label} onChange={(e) => setD({ ...d, hours: d.hours.map((x) => (x.id === h.id ? { ...x, label: e.target.value } : x)) })} placeholder="Mon-Sat" aria-label="Days" />
                    <Input value={h.value} onChange={(e) => setD({ ...d, hours: d.hours.map((x) => (x.id === h.id ? { ...x, value: e.target.value } : x)) })} placeholder="9am-9pm" aria-label="Hours" />
                    <Button type="button" variant="ghost" aria-label="Remove row" onClick={() => setD({ ...d, hours: d.hours.filter((x) => x.id !== h.id) })}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="secondary" onClick={() => setD({ ...d, hours: [...d.hours, { id: ++n, label: '', value: '' }] })}><Plus className="size-3.5" />Add hours</Button>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="How your assistant should behave" description="Standing instructions, plus the words that should alert you." />
          <CardBody className="space-y-4">
            <Field label="Instructions" hint={`${finalInstructions.length} / 1500 characters`} error={tooLong ? 'Too long. Shorten it, or replace your existing instructions.' : null}>
              <Textarea rows={5} value={d.instructions} onChange={(e) => setD({ ...d, instructions: e.target.value })} />
            </Field>
            {existing && (
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={d.appendMode} onChange={(e) => setD({ ...d, appendMode: e.target.checked })} />Add to my existing instructions instead of replacing them</label>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Call me in when a customer says…" hint="Separate with commas."><Input value={d.escalate} onChange={(e) => setD({ ...d, escalate: e.target.value })} /></Field>
              <Field label="Topics to avoid" hint="Separate with commas."><Input value={d.avoid} onChange={(e) => setD({ ...d, avoid: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-muted-foreground">Keywords are added to the ones you already have. The maximum discount is set under AI assistant, never by the AI.</p>
          </CardBody>
        </Card>

        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-lg border bg-card/95 p-3 shadow-lg backdrop-blur">
          <Button onClick={save} loading={saving} disabled={tooLong}>Save to my assistant</Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader title="Answer a few questions" description="Short answers are fine, in your own words (Pidgin or any language is OK). Skip any you like. We turn them into FAQs, policies and rules for your assistant." />
      <CardBody className="space-y-5">
        {questions.map((q, i) => (
          <Field key={q.id} label={`${i + 1}. ${q.q}`}>
            <Textarea rows={2} maxLength={800} value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder={q.hint} />
          </Field>
        ))}
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">Answers are sent to our AI provider to write the draft.</p>
          <Button onClick={generate} loading={busy} disabled={filled.length === 0}><Sparkles className="size-4" />{busy ? 'Writing…' : 'Write my draft'}</Button>
        </div>
      </CardBody>
    </Card>
  );
}
