'use client';
import { FlaskConical, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { Badge, Button, Card, ErrorNote, Input, Textarea, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import type { PracticeReply } from '@/lib/types';

interface Turn { role: 'user' | 'assistant'; content: string; actions?: PracticeReply['actions']; handedOff?: boolean }

const actionLabel: Record<string, string> = {
  search_products: 'Looked up items', check_stock: 'Checked stock', get_delivery_fee: 'Checked delivery fee', create_order: 'Would create an order',
  check_order_status: 'Checked an order', apply_discount: 'Applied a discount', send_product_image: 'Would send a photo', save_customer_detail: 'Noted a detail', handoff_to_human: 'Would call you in'
};

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
    <Card className="flex h-[min(640px,calc(100dvh-14rem))] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-2.5 text-[13px] text-muted-foreground">
        <FlaskConical className="size-4" />Practice mode: you are the customer. Nothing is saved, sent or charged to a real customer.
        {turns.length > 0 && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setTurns([]); setFixing(null); setErr(null); }}>Start over</Button>}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && (
          <div className="mx-auto mt-8 max-w-sm text-center text-[13px] text-muted-foreground">
            Write what a customer would write, in any language. Try &ldquo;how much is delivery?&rdquo; or ask for something you do not sell.
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className="max-w-[85%] space-y-1.5">
              <div className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${t.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-muted/50'}`}>{t.content}</div>
              {t.role === 'assistant' && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {t.actions?.map((a, k) => <Badge key={k} tone={a.failed ? 'warning' : 'neutral'}>{actionLabel[a.name] ?? a.name}{a.failed ? ' (failed)' : ''}</Badge>)}
                  {t.handedOff && <Badge tone="warning">Handed to you</Badge>}
                  <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => { setFixing(fixing === i ? null : i); setRule(null); setFix(''); }}>Not right? Teach it</button>
                </div>
              )}
              {fixing === i && (
                <div className="space-y-2 rounded-lg border bg-card p-3">
                  {rule === null ? (
                    <>
                      <label className="text-xs font-medium">What should it have said or done?</label>
                      <Textarea rows={2} value={fix} onChange={(e) => setFix(e.target.value)} placeholder="e.g. Party packs need 24 hours notice, so say that" maxLength={600} />
                      <Button size="sm" onClick={() => propose(i)} loading={fixBusy} disabled={fix.trim().length < 3}>Turn into a rule</Button>
                    </>
                  ) : (
                    <>
                      <label className="text-xs font-medium">New rule (edit if needed)</label>
                      <Input value={rule} onChange={(e) => setRule(e.target.value)} maxLength={200} />
                      <div className="flex gap-2"><Button size="sm" onClick={saveRule} loading={fixBusy} disabled={rule.trim().length < 5}>Save rule</Button><Button size="sm" variant="ghost" onClick={() => setRule(null)}>Back</Button></div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-[13px] text-muted-foreground">Assistant is typing…</div>}
        <div ref={end} />
      </div>
      {err && <div className="px-4 pb-2"><ErrorNote>{err}</ErrorNote></div>}
      <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type as a customer…" maxLength={2000} aria-label="Customer message" />
        <Button type="submit" disabled={!text.trim() || busy} aria-label="Send"><Send className="size-4" /></Button>
      </form>
    </Card>
  );
}
