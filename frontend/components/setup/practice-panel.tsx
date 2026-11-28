'use client';
import { ArrowUp, Bot, FlaskConical, GraduationCap, Hand, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { Button, Card, ErrorNote, Input, Textarea, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { PracticeReply } from '@/lib/types';

interface Turn { role: 'user' | 'assistant'; content: string; actions?: PracticeReply['actions']; handedOff?: boolean }

const actionLabel: Record<string, string> = {
  search_products: 'Looked up items', check_stock: 'Checked stock', get_delivery_fee: 'Checked delivery fee', create_order: 'Would create an order',
  check_order_status: 'Checked an order', apply_discount: 'Applied a discount', send_product_image: 'Would send a photo', save_customer_detail: 'Noted a detail', handoff_to_human: 'Would call you in'
};

/* Things worth trying first: the price list, delivery, something you don't sell, and a reason to hand over. */
const samples = ['How much is delivery?', 'What do you have?', 'I want a refund'];

export function PracticePanel() {
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fixing, setFixing] = useState<number | null>(null);
  const [fix, setFix] = useState('');
  const [rule, setRule] = useState<string | null>(null);
  const [fixBusy, setFixBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [turns, busy]);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: t }];
    setTurns(next); setText(''); setBusy(true); setErr(null);
    try {
      const r = await api.post<PracticeReply>('setup-ai/preview', { messages: next.map(({ role, content }) => ({ role, content })) });
      setTurns([...next, { role: 'assistant', content: r.reply, actions: r.actions, handedOff: r.handedOff }]);
    } catch (e) { setErr((e as Error).message); setTurns(turns); setText(t); } finally { setBusy(false); }
  }

  async function propose(i: number) {
    setFixBusy(true); setErr(null);
    try {
      const r = await api.post<{ rule: string }>('setup-ai/correction', { customerMessage: turns[i - 1]?.content ?? '', assistantReply: turns[i]!.content, correction: fix.trim() });
      setRule(r.rule);
    } catch (e) { setErr((e as Error).message); } finally { setFixBusy(false); }
  }
  async function saveRule() {
    if (!rule) return;
    setFixBusy(true); setErr(null);
    try {
      await api.post('setup-ai/rules/append', { rule: rule.trim() });
      await mutate('business');
      toast('Rule saved. Ask again to see the difference.');
      setFixing(null); setFix(''); setRule(null);
    } catch (e) { setErr((e as Error).message); } finally { setFixBusy(false); }
  }

  return (
    <Card className="flex h-[min(640px,calc(100dvh-10rem))] min-h-[440px] flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg border border-brand/25 bg-brand/10 text-brand"><FlaskConical className="size-4" strokeWidth={1.75} /></span>
        <div className="min-w-0 flex-1 text-sm font-medium" title="You're the customer. Nothing is sent to anyone.">Try it</div>
        {turns.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setTurns([]); setFixing(null); setErr(null); }}><RotateCcw className="size-3.5" />Clear</Button>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-4 py-5">
          {turns.length === 0 && (
            <div className="animate-rise mx-auto mt-10 max-w-md text-center">
              <p className="text-[13px] text-muted-foreground">Chat like a customer</p>
              <div className="stagger mt-3 flex flex-wrap justify-center gap-2">
                {samples.map((x) => (
                  <button key={x} type="button" onClick={() => setText(x)}
                    className="rounded-full border bg-card px-3 py-1.5 text-[13px] text-muted-foreground transition-[color,border-color,transform] duration-150 hover:border-ring/70 hover:text-foreground active:scale-[0.97]">{x}</button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={cn('animate-bubble flex', t.role === 'user' ? 'origin-bottom-right justify-end' : 'origin-bottom-left justify-start')}>
              <div className="max-w-[85%] space-y-1.5">
                <div className={cn('whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                  t.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-brand/20 bg-brand/10')}>{t.content}</div>
                {t.role === 'assistant' && (
                  <div className="flex flex-wrap items-center gap-1.5 px-0.5">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Bot className="size-3 text-brand" />Assistant</span>
                    {t.actions?.map((a, k) => (
                      <span key={k} className={cn('rounded-md border px-1.5 py-0.5 text-[11px]', a.failed ? 'border-warning/30 bg-warning-bg text-warning' : 'bg-muted/50 text-muted-foreground')}>
                        {actionLabel[a.name] ?? a.name}{a.failed ? ' (failed)' : ''}
                      </span>
                    ))}
                    {t.handedOff && <span className="flex items-center gap-1 rounded-md border border-warning/30 bg-warning-bg px-1.5 py-0.5 text-[11px] text-warning"><Hand className="size-3" />Handed to you</span>}
                    <button type="button" className={cn('ml-1 flex items-center gap-1 text-[11px] transition-colors', fixing === i ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
                      onClick={() => { setFixing(fixing === i ? null : i); setRule(null); setFix(''); }}><GraduationCap className="size-3" />Fix</button>
                  </div>
                )}
                {fixing === i && (
                  <div className="animate-rise space-y-2 rounded-xl border bg-card p-3 shadow-sm">
                    {rule === null ? (
                      <>
                        <Textarea rows={2} value={fix} onChange={(e) => setFix(e.target.value)} placeholder="What should it have said?" aria-label="What should it have said?" maxLength={600} />
                        <Button size="sm" onClick={() => propose(i)} loading={fixBusy} disabled={fix.trim().length < 3}>Turn into a rule</Button>
                      </>
                    ) : (
                      <>
                        <label className="text-xs font-medium">New rule</label>
                        <Input value={rule} onChange={(e) => setRule(e.target.value)} maxLength={200} />
                        <div className="flex gap-2"><Button size="sm" onClick={saveRule} loading={fixBusy} disabled={rule.trim().length < 5}>Save rule</Button><Button size="sm" variant="ghost" onClick={() => setRule(null)}>Back</Button></div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="animate-bubble flex origin-bottom-left">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-brand/20 bg-brand/10 px-3.5 py-3" aria-label="Assistant is typing">
                {[0, 1, 2].map((k) => <span key={k} className="typing-dot size-1.5 rounded-full bg-brand" style={{ animationDelay: `${k * 0.15}s` }} />)}
              </div>
            </div>
          )}
          <div ref={end} />
        </div>
      </div>

      {err && <div className="px-4 pb-2"><ErrorNote>{err}</ErrorNote></div>}
      <form className="p-3 pt-0" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <div className="flex items-center gap-2 rounded-xl border border-input-border bg-input p-1.5 pl-3.5 shadow-[var(--input-shadow)] transition-[border-color,box-shadow] duration-150 hover:border-ring/70 focus-within:border-brand/70 focus-within:ring-[3px] focus-within:ring-brand/20">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" maxLength={2000} aria-label="Customer message"
            className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" />
          <Button type="submit" size="sm" className="size-8 px-0" disabled={!text.trim() || busy} aria-label="Send"><ArrowUp className="size-4" /></Button>
        </div>
      </form>
    </Card>
  );
}
