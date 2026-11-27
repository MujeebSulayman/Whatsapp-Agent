'use client';
import { ArrowLeft, Bot, MessageSquare, Search, Send, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';
import { ConvBadge, OrderBadge } from '@/components/badges';
import { Avatar, Badge, Button, EmptyState, ErrorNote, Input, Loading, Tabs, Textarea, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { ConversationDetail, ConversationRow, ConvStatus, Message } from '@/lib/types';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';
import { useMoney } from '@/lib/use-money';

type Filter = 'all' | ConvStatus;

export default function InboxPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const qs = new URLSearchParams({ ...(filter !== 'all' ? { status: filter } : {}), ...(search ? { search } : {}) }).toString();
  const listKey = `conversations${qs ? `?${qs}` : ''}`;
  const { data: rows, isLoading } = useApi<ConversationRow[]>(listKey, { refreshInterval: 4000 });
  const active = selected ?? null;

  return (
    <div>
      <div className="grid h-[calc(100dvh-3.5rem)] md:h-dvh lg:grid-cols-[340px_1fr] xl:grid-cols-[340px_1fr_300px]">
        {/* conversation list */}
        <section className={cn('flex min-h-0 flex-col border-r bg-card', active && 'hidden lg:flex')}>
          <div className="space-y-3 border-b p-4">
            <h1 className="text-base font-semibold">Inbox</h1>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name or number" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Tabs value={filter} onChange={setFilter} tabs={[{ id: 'all', label: 'All' }, { id: 'human', label: 'Needs you' }, { id: 'ai', label: 'AI' }, { id: 'closed', label: 'Closed' }]} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? <Loading /> : !rows?.length ? (
              <EmptyState icon={<MessageSquare className="size-5" />} title="No conversations yet" description="When customers message your WhatsApp number, their chats appear here." />
            ) : rows.map((c) => (
              <button key={c.id} onClick={() => setSelected(c.id)} className={cn('flex w-full items-start gap-3 border-b px-4 py-3 text-left hover:bg-muted/50', active === c.id && 'bg-muted')}>
                <Avatar name={c.customer.name ?? c.customer.waId} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.customer.name ?? `+${c.customer.waId}`}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(c.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                    {c.lastMessage ? `${c.lastMessage.direction === 'outbound' ? 'You: ' : ''}${c.lastMessage.body ?? `[${c.lastMessage.type}]`}` : 'No messages'}
                  </div>
                  {c.status === 'human' && <Badge tone="warning" className="mt-1.5">Needs you</Badge>}
                </div>
              </button>
            ))}
          </div>
        </section>

        {active ? <Thread id={active} listKey={listKey} onBack={() => setSelected(null)} /> : (
          <section className="hidden min-h-0 items-center justify-center bg-background lg:flex lg:col-span-1 xl:col-span-2">
            <EmptyState icon={<MessageSquare className="size-5" />} title="Select a conversation" description="Pick a chat on the left to read it, take over from the AI, or reply." />
          </section>
        )}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  const mine = m.direction === 'outbound';
  const human = m.sentBy === 'human';
  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      <div className={cn('max-w-[78%] whitespace-pre-wrap wrap-break-word rounded-2xl px-3.5 py-2 text-sm', !mine ? 'rounded-bl-sm bg-muted' : human ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-br-sm border bg-card')}>
        {m.type === 'image' && m.mediaUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.mediaUrl} alt="" className="mb-1 max-h-48 rounded-md" />}
        {m.body ?? (m.type !== 'text' ? `[${m.type}]` : '')}
      </div>
      <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        {mine && (human ? <UserRound className="size-3" /> : <Bot className="size-3" />)}
        {mine ? (human ? 'You' : 'AI') : null}<span>{formatDateTime(m.createdAt)}</span>
      </div>
    </div>
  );
}

function Thread({ id, listKey, onBack }: { id: string; listKey: string; onBack: () => void }) {
  const money = useMoney();
  const toast = useToast();
  const key = `conversations/${id}`;
  const { data, error } = useApi<ConversationDetail>(key, { refreshInterval: 3000 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [count, id]);

  const windowClosed = useMemo(() => !!data?.conversation.windowExpiresAt && new Date(data.conversation.windowExpiresAt).getTime() < Date.now(), [data]);
  if (error) return <section className="flex items-center justify-center p-6"><ErrorNote>{error.message}</ErrorNote></section>;
  if (!data) return <section className="flex items-center justify-center"><Loading /></section>;
  const { conversation, customer, messages, orders } = data;

  async function act(name: 'takeover' | 'handback' | 'close') {
    setBusy(name); setErr(null);
    try {
      await api.post(`conversations/${id}/${name}`);
      await Promise.all([mutate(key), mutate(listKey)]);
      toast(name === 'takeover' ? 'You are now replying. The AI is paused for this chat.' : name === 'handback' ? 'Handed back to the AI.' : 'Conversation closed.');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy('send'); setErr(null);
    try {
      await api.post(`conversations/${id}/messages`, { body });
      setText('');
      await Promise.all([mutate(key), mutate(listKey)]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <>
      <section className="flex min-h-0 flex-col bg-background">
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
          <button className="lg:hidden" onClick={onBack} aria-label="Back"><ArrowLeft className="size-5" /></button>
          <Avatar name={customer.name ?? customer.waId} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{customer.name ?? `+${customer.waId}`}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">+{customer.waId} <ConvBadge status={conversation.status} /></div>
          </div>
          <div className="flex items-center gap-2">
            {conversation.status === 'ai' && <Button size="sm" onClick={() => act('takeover')} loading={busy === 'takeover'}>Take over</Button>}
            {conversation.status !== 'ai' && <Button size="sm" variant="secondary" onClick={() => act('handback')} loading={busy === 'handback'}>{conversation.status === 'closed' ? 'Reopen with AI' : 'Hand back to AI'}</Button>}
            {conversation.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => act('close')} loading={busy === 'close'}>Close</Button>}
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5">
          {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No messages yet.</p>}
          {messages.map((m) => <Bubble key={m.id} m={m} />)}
          <div ref={bottom} />
        </div>

        <footer className="border-t bg-card p-3">
          {err && <div className="mb-2"><ErrorNote>{err}</ErrorNote></div>}
          {windowClosed ? (
            <p className="rounded-md bg-warning-bg px-3 py-2 text-[13px] text-warning">The 24-hour reply window has closed. WhatsApp only allows an approved template message until the customer writes again.</p>
          ) : (
            <>
              {conversation.status === 'ai' && <p className="mb-2 text-xs text-muted-foreground">The AI is handling this chat. Sending a message will take over and pause the AI.</p>}
              <div className="flex items-end gap-2">
                <Textarea rows={1} className="max-h-32 min-h-9 resize-none" placeholder="Write a reply…" value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
                <Button onClick={send} loading={busy === 'send'} disabled={!text.trim()}><Send className="size-4" />Send</Button>
              </div>
            </>
          )}
        </footer>
      </section>

      <aside className="hidden min-h-0 overflow-y-auto border-l bg-card p-5 xl:block">
        <h3 className="text-sm font-semibold">Customer</h3>
        <dl className="mt-3 space-y-2 text-[13px]">
          <div className="flex justify-between"><dt className="text-muted-foreground">Name</dt><dd>{customer.name ?? '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">WhatsApp</dt><dd>+{customer.waId}</dd></div>
        </dl>
        {customer.notes && <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3 text-[13px]">{customer.notes}</p>}
        <h3 className="mb-3 mt-6 text-sm font-semibold">Recent orders</h3>
        {orders.length === 0 ? <p className="text-[13px] text-muted-foreground">No orders yet.</p> : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between"><span className="text-sm font-medium tabular-nums">{money.fmt(o.totalMinor)}</span><OrderBadge status={o.status} /></div>
                <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(o.createdAt)} · {o.items.reduce((n, i) => n + i.quantity, 0)} items</div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}
