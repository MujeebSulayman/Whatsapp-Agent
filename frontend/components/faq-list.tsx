'use client';
import { HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { mutate } from 'swr';
import { SuggestButton } from '@/components/setup/suggest-button';
import { Button, Card, CardHeader, Dialog, EmptyState, ErrorNote, Field, IconButton, Input, Loading, Textarea, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { Faq } from '@/lib/types';

/** Questions customers often ask, with the answers the assistant gives. Used on the Business page and in the setup. */
export function FaqList() {
  const toast = useToast();
  const { data: faqs, isLoading } = useApi<Faq[]>('faqs');
  const [target, setTarget] = useState<Faq | 'new' | null>(null);
  const [seed, setSeed] = useState<unknown>(null);
  const [f, setF] = useState({ question: '', answer: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = target && target !== 'new' ? target : null;
  if (target !== seed) { setSeed(target); setErr(null); setF(q ? { question: q.question, answer: q.answer } : { question: '', answer: '' }); }

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (q) await api.patch(`faqs/${q.id}`, f); else await api.post('faqs', f);
      await Promise.all([mutate('faqs'), mutate('business')]); toast('FAQ saved'); setTarget(null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api.delete(`faqs/${id}`); await Promise.all([mutate('faqs'), mutate('business')]); toast('FAQ removed'); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <Card>
      <CardHeader title="Frequently asked questions" action={<Button size="sm" onClick={() => setTarget('new')}><Plus className="size-3.5" />Add FAQ</Button>} />
      {isLoading ? <Loading /> : !faqs?.length ? <EmptyState icon={<HelpCircle />} title="No FAQs yet" /> : (
        <ul className="stagger divide-y divide-border/60 border-t">
          {faqs.map((x) => (
            <li key={x.id} className="group flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0"><div className="text-sm font-medium">{x.question}</div><p className="mt-1 whitespace-pre-wrap text-[13px] text-muted-foreground">{x.answer}</p></div>
              <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100"><IconButton label="Edit FAQ" onClick={() => setTarget(x)}><Pencil /></IconButton><IconButton label="Delete FAQ" tone="danger" onClick={() => remove(x.id)}><Trash2 /></IconButton></div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!target} onClose={() => setTarget(null)} title={q ? 'Edit FAQ' : 'Add FAQ'}
        footer={<><Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button><Button type="submit" form="faq-form" loading={busy}>Save</Button></>}>
        <form id="faq-form" onSubmit={submit} className="space-y-4">
          {err && <ErrorNote>{err}</ErrorNote>}
          <Field label="Question"><Input required minLength={3} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} /></Field>
          <Field label="Answer"><Textarea required rows={4} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} /><SuggestButton field="faq_answer" text={f.answer} context={f.question} onUse={(v) => setF({ ...f, answer: v })} /></Field>
        </form>
      </Dialog>
    </Card>
  );
}

