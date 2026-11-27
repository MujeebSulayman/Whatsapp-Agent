import { Bot, Hand, MessageSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { Bubble, wallpaper } from './whatsapp-phone';

/* Small, real-looking slices of the product, one per feature row. Illustrations, built in code. */

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e10] shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)] ${className}`}>{children}</div>;
}

/** WhatsApp: asked for something that is not in the catalogue, it says so instead of inventing a price. */
export function NoGuessingVisual() {
  return (
    <Panel className="bg-[#0b141a]">
      <div className="flex items-center gap-2.5 border-b border-black/40 bg-[#1f2c34] px-4 py-3">
        <span className="grid size-8 place-items-center rounded-full bg-[#2563eb] text-[12px] font-semibold text-white">CB</span>
        <span className="leading-tight"><span className="block text-[14px] font-medium text-[#e9edef]">CoolBreeze AC</span><span className="text-[11px] text-[#8696a0]">Business account</span></span>
      </div>
      <div className="flex flex-col gap-1.5 px-4 py-5" style={{ backgroundImage: wallpaper }}>
        <Bubble from="customer" time="8:15 PM">How much to install a 2HP split unit in my office? It is on the 4th floor.</Bubble>
        <Bubble from="shop" time="8:15 PM">Installs start from ₦45,000, but a 2HP unit on the 4th floor depends on the pipe run, so I won’t guess a price. I’ve asked our technician and he’ll reply here shortly 🙏</Bubble>
      </div>
    </Panel>
  );
}

/** The inbox: a chat flagged for a person, with the summary and the take-over button. */
export function HandoverVisual() {
  return (
    <Panel>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-[13px]">
        <span className="font-medium">Inbox</span>
        <span className="flex gap-1 rounded-lg border border-white/10 p-0.5 text-[12px] text-muted-foreground">
          <span className="rounded-md px-2 py-0.5">All</span><span className="rounded-md bg-white/10 px-2 py-0.5 text-foreground">Needs you</span><span className="rounded-md px-2 py-0.5">AI</span>
        </span>
      </div>
      <div className="p-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-3">
            <span className="relative grid size-9 place-items-center rounded-full bg-white/10 text-[12px] text-muted-foreground">
              AE<span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[#0e0e10] bg-warning" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[14px] font-medium">Amaka Eze</span>
              <span className="text-[12px] text-muted-foreground">Wants an exchange · 2 min ago</span>
            </span>
            <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11.5px] text-warning">Needs you</span>
          </div>
          <p className="mt-3 rounded-lg bg-black/40 p-3 text-[13px] leading-relaxed text-muted-foreground">
            <span className="mb-1 flex items-center gap-1.5 text-[12px] text-foreground"><Bot className="size-3.5" />Summary from the assistant</span>
            Order #K7T2Q4 arrived in size 43 instead of 44. She wants to exchange the Air Runner (₦45,000). I have paused and told her you will reply.
          </p>
          <div className="mt-3 flex gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground"><Hand className="size-3.5" />Take over</span>
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[13px]"><MessageSquare className="size-3.5" />Open chat</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** AI assistant settings: the limits it can never cross. */
export function LimitsVisual() {
  return (
    <Panel>
      <div className="border-b border-white/10 px-4 py-3 text-[13px] font-medium">AI assistant · Limits</div>
      <div className="space-y-5 p-5 text-[13px]">
        <div>
          <div className="flex justify-between"><span>Maximum discount</span><span className="font-medium">10%</span></div>
          <div className="mt-2.5 h-1.5 rounded-full bg-white/10"><div className="relative h-full w-[20%] rounded-full bg-foreground"><span className="absolute -right-2 -top-[5px] size-4 rounded-full border-2 border-[#0e0e10] bg-foreground" /></div></div>
          <p className="mt-2 text-[12px] text-muted-foreground">It can offer up to 10% and never more, whatever the customer says.</p>
        </div>
        <div>
          <div>Topics to avoid</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['Competitor prices', 'Medical advice', 'Politics'].map((t) => <span key={t} className="rounded-full border border-white/15 px-2.5 py-1 text-[12px]">{t}</span>)}
          </div>
        </div>
        <div>
          <div>Standing instructions</div>
          <p className="mt-2 rounded-lg border border-white/10 bg-black/40 p-3 text-[12.5px] leading-relaxed text-muted-foreground">“Orders paid after 6 PM go out the next morning. Always say so.”</p>
        </div>
      </div>
    </Panel>
  );
}
