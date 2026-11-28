'use client';
import { ArrowDown, ArrowUp, Hand, ListChecks, MessageSquareText, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { mutate } from 'swr';
import { useAiAvailable } from '@/components/setup/use-ai';
import { Avatar, Button, Card, Checkbox, Dialog, EmptyState, ErrorNote, Field, IconButton, Input, Loading, PageHeader, Select, StatusDot, Switch, Tabs, Textarea, useToast } from '@/components/ui';
import { cn, timeAgo } from '@/lib/utils';
import { api, useApi, useMe } from '@/lib/api';
import type { Playbook, PlaybookDraft, PlaybookResponse } from '@/lib/types';

const KEY = 'playbooks';
type Tab = 'playbooks' | 'responses';
let rowId = 0;

export default function PlaybooksPage() {
  const toast = useToast();
  const me = useMe();
  const owner = me.data?.role === 'owner';
  const [tab, setTab] = useState<Tab>('playbooks');
  const { data, isLoading } = useApi<Playbook[]>(KEY);
  const [editing, setEditing] = useState<Playbook | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Playbook | null>(null);

  async function toggle(p: Playbook, active: boolean) {
    await mutate(KEY, (cur?: Playbook[]) => cur?.map((x) => (x.id === p.id ? { ...x, active } : x)), false);
    try { await api.patch(`playbooks/${p.id}`, { active }); } catch (e) { toast((e as Error).message, 'error'); await mutate(KEY); }
  }
  async function remove() {
    if (!deleting) return;
    try { await api.delete(`playbooks/${deleting.id}`); await Promise.all([mutate(KEY), mutate('playbooks/responses')]); toast('Playbook deleted'); setDeleting(null); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <>
      <PageHeader title="Playbooks"
        actions={owner ? <Button onClick={() => setEditing('new')}><Plus className="size-4" />New playbook</Button> : undefined} />
      <div className="mb-5"><Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'playbooks', label: 'Playbooks', count: data?.length }, { id: 'responses', label: 'Customer answers' }]} /></div>

      {tab === 'playbooks' && (isLoading ? <Loading /> : !data?.length ? (
        <Card><EmptyState icon={<ListChecks />} title="No playbooks yet"
          description="Steps the assistant follows for a kind of customer."
          action={owner ? <Button onClick={() => setEditing('new')}>Create your first playbook</Button> : undefined} /></Card>
      ) : (
        <div className="stagger grid gap-4 lg:grid-cols-2">
          {data.map((p) => (
            <Card key={p.id} className={cn('flex flex-col transition-opacity', !p.active && 'opacity-70')}>
              <div className="flex items-start gap-3 px-5 pt-5">
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg border', p.active ? 'border-brand/25 bg-brand/10 text-brand' : 'bg-muted/50 text-muted-foreground')}><ListChecks className="size-4" strokeWidth={1.75} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-medium">{p.name}</h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <StatusDot tone={p.active ? 'success' : 'neutral'} className="text-xs">{p.active ? 'On' : 'Off'}</StatusDot>
                    <span className="tabular-nums">{p.runs} {p.runs === 1 ? 'customer' : 'customers'}</span>
                  </div>
                </div>
                {owner && <Switch checked={p.active} onChange={(v) => toggle(p, v)} label={`${p.name} on`} />}
              </div>
              <p className="mx-5 mt-3 rounded-lg bg-muted/40 px-3 py-2 text-[13px]"><span className="text-muted-foreground">Used when </span>{p.whenToUse}</p>
              <ol className="relative mx-5 mt-4 flex-1 space-y-2.5 pb-1 text-[13px] before:absolute before:bottom-3 before:left-[9px] before:top-2 before:w-px before:bg-border">
                {p.steps.map((s, i) => (
                  <li key={s.id} className="relative flex gap-3">
                    <span className="z-10 flex size-[19px] shrink-0 items-center justify-center rounded-full border bg-card text-[10px] font-medium text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="pt-px">{s.ask}{!s.required && <span className="text-muted-foreground"> · optional</span>}</span>
                  </li>
                ))}
                <li className="relative flex gap-3">
                  <span className="z-10 flex size-[19px] shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand/15 text-brand">
                    {p.finish === 'handoff' ? <Hand className="size-2.5" strokeWidth={2.5} /> : <MessageSquareText className="size-2.5" strokeWidth={2.5} />}
                  </span>
                  <span className="pt-px text-muted-foreground">{p.finish === 'handoff' ? 'You are called in with a summary' : 'The customer gets your message'}</span>
                </li>
              </ol>
              {owner && (
                <div className="mt-4 flex justify-end gap-0.5 border-t px-3 py-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}><Pencil className="size-3.5" />Edit</Button>
                  <IconButton label={`Delete ${p.name}`} tone="danger" onClick={() => setDeleting(p)}><Trash2 /></IconButton>
                </div>
              )}
            </Card>
          ))}
        </div>
      ))}

      {tab === 'responses' && <Responses />}

      <PlaybookDialog target={editing} onClose={() => setEditing(null)} />
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete playbook?" description={deleting ? `“${deleting.name}” and the answers customers gave through it will be removed.` : undefined}
        footer={<><Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}><span /></Dialog>
    </>
  );
}

function Responses() {
  const { data, isLoading } = useApi<PlaybookResponse[]>('playbooks/responses');
  if (isLoading) return <Loading />;
  if (!data?.length) return <Card><EmptyState icon={<MessageSquareText />} title="No answers yet" /></Card>;
  return (
    <div className="stagger space-y-3">
      {data.map((r) => (
        <Card key={r.id} className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={r.customer.name ?? r.customer.waId} className="size-8" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium">{r.customer.name ?? `+${r.customer.waId}`}</div>
              <div className="text-xs text-muted-foreground">{r.playbook.name} · {timeAgo(r.createdAt)}</div>
            </div>
            <StatusDot tone={r.status === 'completed' ? 'success' : 'warning'}>{r.status === 'completed' ? 'Complete' : 'In progress'}</StatusDot>
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-3 border-t pt-4 text-[13px] sm:grid-cols-2">
            {r.answers.map((a) => (
              <div key={a.ask}><dt className="text-xs text-muted-foreground">{a.ask}</dt><dd className={cn('mt-0.5', !a.answer && 'text-muted-foreground/70 italic')}>{a.answer ?? 'Not answered yet'}</dd></div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  );
}

function PlaybookDialog({ target, onClose }: { target: Playbook | 'new' | null; onClose: () => void }) {
  const toast = useToast();
  const { available } = useAiAvailable();
  const p = target && target !== 'new' ? target : null;
  const [f, setF] = useState({ name: '', whenToUse: '', finish: 'handoff' as 'handoff' | 'message', finishMessage: '' });
  const [steps, setSteps] = useState<{ key: number; id?: string; ask: string; required: boolean }[]>([]);
  const [idea, setIdea] = useState('');
  const [seed, setSeed] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  if (target !== seed) {
    setSeed(target); setErr(null); setIdea('');
    setF(p ? { name: p.name, whenToUse: p.whenToUse, finish: p.finish, finishMessage: p.finishMessage ?? '' } : { name: '', whenToUse: '', finish: 'handoff', finishMessage: '' });
    setSteps(p ? p.steps.map((s) => ({ key: ++rowId, id: s.id, ask: s.ask, required: s.required })) : [{ key: ++rowId, ask: '', required: true }]);
  }
  const move = (i: number, d: -1 | 1) => setSteps((cur) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return cur; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });

  async function draft() {
    setDrafting(true); setErr(null);
    try {
      const d = await api.post<PlaybookDraft>('setup-ai/playbook', { description: idea });
      setF({ name: d.name, whenToUse: d.whenToUse, finish: d.finish, finishMessage: d.finishMessage ?? '' });
      setSteps(d.steps.map((s) => ({ key: ++rowId, ask: s.ask, required: s.required })));
    } catch (e) { setErr((e as Error).message); } finally { setDrafting(false); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = steps.filter((s) => s.ask.trim());
    if (clean.length === 0) return setErr('Add at least one thing to find out');
    if (f.finish === 'message' && !f.finishMessage.trim()) return setErr('Write the message the customer should get at the end');
    const body = { name: f.name.trim(), whenToUse: f.whenToUse.trim(), steps: clean.map((s) => ({ ...(s.id ? { id: s.id } : {}), ask: s.ask.trim(), required: s.required })), finish: f.finish, finishMessage: f.finishMessage.trim() || null };
    setBusy(true); setErr(null);
    try {
      if (p) await api.patch(`playbooks/${p.id}`, body); else await api.post('playbooks', body);
      await mutate(KEY);
      toast(p ? 'Playbook updated' : 'Playbook created');
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={!!target} onClose={onClose} wide title={p ? 'Edit playbook' : 'New playbook'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="playbook-form" loading={busy}>{p ? 'Save changes' : 'Create playbook'}</Button></>}>
      <form id="playbook-form" onSubmit={submit} className="space-y-4">
        {err && <ErrorNote>{err}</ErrorNote>}
        {!p && available && (
          <div className="rounded-xl border border-brand/20 bg-brand/[0.05] p-3.5">
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium"><Sparkles className="size-3.5 text-brand" />Not sure how to write it?</div>
            <Textarea rows={2} maxLength={1200} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Describe it the way you would tell a friend, e.g. “When someone asks about a class I ask what they want to learn and their level, then I call them.”" />
            <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={draft} loading={drafting} disabled={idea.trim().length < 10}><Sparkles className="size-3.5" />Draft it for me</Button>
          </div>
        )}
        <Field label="Name"><Input required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. New enquiry, Quote request, Viewing" /></Field>
        <Field label="When should the assistant use it?"><Input required maxLength={300} value={f.whenToUse} onChange={(e) => setF({ ...f, whenToUse: e.target.value })} placeholder="e.g. Someone asks about joining a class" /></Field>
        <div>
          <div className="mb-1.5 text-[13px] font-medium">What should it find out, in order?</div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={s.key} className="animate-rise flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium text-muted-foreground tabular-nums">{i + 1}</span>
                <Input value={s.ask} maxLength={200} aria-label={`Step ${i + 1}`} placeholder="e.g. What do they want to learn?" onChange={(e) => setSteps(steps.map((x) => (x.key === s.key ? { ...x, ask: e.target.value } : x)))} />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><Checkbox checked={s.required} onChange={(e) => setSteps(steps.map((x) => (x.key === s.key ? { ...x, required: e.target.checked } : x)))} />Needed</label>
                <IconButton type="button" label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp /></IconButton>
                <IconButton type="button" label="Move down" onClick={() => move(i, 1)} disabled={i === steps.length - 1}><ArrowDown /></IconButton>
                <IconButton type="button" label="Remove step" tone="danger" onClick={() => setSteps(steps.filter((x) => x.key !== s.key))}><Trash2 /></IconButton>
              </div>
            ))}
            {steps.length < 12 && <Button type="button" size="sm" variant="ghost" className="ml-6" onClick={() => setSteps([...steps, { key: ++rowId, ask: '', required: true }])}><Plus className="size-3.5" />Add a step</Button>}
          </div>
        </div>
        <Field label="When every needed step is answered">
          <Select value={f.finish} onChange={(e) => setF({ ...f, finish: e.target.value as 'handoff' | 'message' })}>
            <option value="handoff">Call me in, with a summary of what they said</option>
            <option value="message">Just send them a message</option>
          </Select>
        </Field>
        <Field label={f.finish === 'message' ? 'Message to the customer' : 'What to tell the customer (optional)'}><Textarea rows={2} maxLength={500} value={f.finishMessage} onChange={(e) => setF({ ...f, finishMessage: e.target.value })} placeholder="e.g. Thanks! We will send the details shortly." /></Field>
      </form>
    </Dialog>
  );
}
