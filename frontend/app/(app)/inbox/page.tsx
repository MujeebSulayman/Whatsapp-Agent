'use client';
import { ArrowLeft, ArrowUp, Bot, MessageSquare, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mutate } from 'swr';
import { ConvBadge, OrderBadge } from '@/components/badges';
import { Avatar, Button, EmptyState, ErrorNote, Loading, SearchInput, Segmented, useToast } from '@/components/ui';
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
    <div className="grid h-[calc(100dvh-3.5rem)] md:h-dvh lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_280px]">
      {/* conversation list */}
      <section className={cn('flex min-h-0 flex-col border-r border-border/60', active && 'hidden lg:flex')}>
        <div className="space-y-3 px-4 pt-5 pb-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
            {rows && <span className="text-xs text-muted-foreground tabular-nums">{rows.length} {rows.length === 1 ? 'chat' : 'chats'}</span>}
          </div>
          <SearchInput placeholder="Search name or number" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Segmented className="w-full [&>button]:flex-1" value={filter} onChange={setFilter}
            options={[{ id: 'all', label: 'All' }, { id: 'human', label: 'Needs you' }, { id: 'ai', label: 'AI' }, { id: 'closed', label: 'Closed' }]} />
        </div>
        <div className="stagger min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {isLoading ? <Loading /> : !rows?.length ? (
            <EmptyState icon={<MessageSquare />} title="No conversations yet" />
          ) : rows.map((c) => (
            <button key={c.id} onClick={() => setSelected(c.id)}
              className={cn('flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors', active === c.id ? 'bg-muted' : 'hover:bg-muted/50')}>
              <div className="relative">
                <Avatar name={c.customer.name ?? c.customer.waId} />
                {c.status === 'human' && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-warning" aria-label="Needs you" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{c.customer.name ?? `+${c.customer.waId}`}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{timeAgo(c.lastMessageAt)}</span>
                </div>
                <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                  {c.lastMessage ? `${c.lastMessage.direction === 'outbound' ? 'You: ' : ''}${c.lastMessage.body ?? `[${c.lastMessage.type}]`}` : 'No messages'}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {active ? <Thread id={active} listKey={listKey} onBack={() => setSelected(null)} /> : (
        <section className="hidden min-h-0 items-center justify-center lg:flex lg:col-span-1 xl:col-span-2">
          <EmptyState icon={<MessageSquare />} title="Select a conversation" />
        </section>
      )}
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  const mine = m.direction === 'outbound';
  const human = m.sentBy === 'human';
  return (
    <div className={cn('animate-bubble flex flex-col', mine ? 'origin-bottom-right items-end' : 'origin-bottom-left items-start')}>
      <div className={cn('max-w-[75%] whitespace-pre-wrap wrap-break-word rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
        !mine ? 'rounded-bl-md bg-muted' : human ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-br-md border border-brand/20 bg-brand/10')}>
        {m.type === 'image' && m.mediaUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.mediaUrl} alt="" className="mb-1 max-h-48 rounded-lg" />}
        {m.body ?? (m.type !== 'text' ? `[${m.type}]` : '')}
      </div>
      <div className="mt-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
        {mine && (human ? <UserRound className="size-3" /> : <Bot className="size-3 text-brand" />)}
        {mine ? <span>{human ? 'You' : 'AI'} ·</span> : null}<span>{formatDateTime(m.createdAt)}</span>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex justify-between gap-3 py-1.5"><dt className="text-muted-foreground">{label}</dt><dd className="truncate text-right">{children}</dd></div>;
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
      <section key={id} className="animate-fade-in flex min-h-0 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-4">
          <button className="lg:hidden" onClick={onBack} aria-label="Back"><ArrowLeft className="size-5" /></button>
          <Avatar name={customer.name ?? customer.waId} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{customer.name ?? `+${customer.waId}`}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">+{customer.waId}<span className="text-border">·</span><ConvBadge status={conversation.status} /></div>
          </div>
          <div className="flex items-center gap-1.5">
            {conversation.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => act('close')} loading={busy === 'close'}>Close</Button>}
            {conversation.status === 'ai' && <Button size="sm" onClick={() => act('takeover')} loading={busy === 'takeover'}>Take over</Button>}
            {conversation.status !== 'ai' && <Button size="sm" variant="secondary" onClick={() => act('handback')} loading={busy === 'handback'}><Bot className="size-3.5" />{conversation.status === 'closed' ? 'Reopen with AI' : 'Hand back to AI'}</Button>}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
            {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No messages yet.</p>}
            {messages.map((m) => <Bubble key={m.id} m={m} />)}
            <div ref={bottom} />
          </div>
        </div>

        <footer className="shrink-0 px-4 pb-4">
          <div className="mx-auto max-w-3xl">
            {err && <div className="mb-2"><ErrorNote>{err}</ErrorNote></div>}
            {windowClosed ? (
              <p className="rounded-lg border border-warning/20 bg-warning-bg px-3 py-2.5 text-[13px] text-warning">24-hour window closed. You can reply when they message again.</p>
            ) : (
              <>
                <div className="flex items-end gap-2 rounded-xl border border-input-border bg-input p-1.5 pl-3.5 shadow-[var(--input-shadow)] transition-[border-color,box-shadow] duration-150 hover:border-ring/70 focus-within:border-brand/70 focus-within:ring-[3px] focus-within:ring-brand/20">
                  <textarea rows={1} aria-label="Reply" className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground" placeholder="Write a reply…" value={text}
                    onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
                  <Button size="sm" className="size-8 px-0" onClick={send} loading={busy === 'send'} disabled={!text.trim()} aria-label="Send">{busy !== 'send' && <ArrowUp className="size-4" />}</Button>
                </div>
                <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
                  {conversation.status === 'ai' ? 'The AI is handling this chat. Sending a message takes over and pauses the AI.' : 'Enter to send · Shift + Enter for a new line'}
                </p>
              </>
            )}
          </div>
        </footer>
      </section>

      <aside className="hidden min-h-0 overflow-y-auto border-l border-border/60 xl:block">
        <div className="flex flex-col items-center border-b border-border/60 px-5 py-6 text-center">
          <Avatar name={customer.name ?? customer.waId} className="size-12 text-sm" />
          <div className="mt-3 text-sm font-medium">{customer.name ?? 'Unknown name'}</div>
          <div className="text-xs text-muted-foreground">+{customer.waId}</div>
        </div>
        <div className="space-y-6 p-5">
          <div>
            <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Details</h3>
            <dl className="text-[13px]">
              <Detail label="Status"><ConvBadge status={conversation.status} /></Detail>
              <Detail label="Orders">{orders.length}</Detail>
            </dl>
            {customer.notes && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-[13px]">{customer.notes}</p>}
          </div>
          <div>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Recent orders</h3>
            {orders.length === 0 ? <p className="text-[13px] text-muted-foreground">No orders yet.</p> : (
              <ul className="space-y-2">
                {orders.map((o) => (
                  <li key={o.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-center justify-between"><span className="text-sm font-medium tabular-nums">{money.fmt(o.totalMinor)}</span><OrderBadge status={o.status} /></div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(o.createdAt)} · {o.items.reduce((n, i) => n + i.quantity, 0)} items</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
