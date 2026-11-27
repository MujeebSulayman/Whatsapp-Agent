import { Camera, Mic, Paperclip, Phone, Smile, Video } from 'lucide-react';
import type { ReactNode } from 'react';

/*
 * A customer's phone, open on a WhatsApp chat with a shop that uses Converso.
 * The customer's messages are green (sent), the shop's replies, written by the assistant, are grey (received).
 * Colours are WhatsApp's own dark theme so it reads as WhatsApp at a glance.
 */

export type Msg = { from: 'customer' | 'shop'; time: string; children: ReactNode };

export const wallpaper =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='84' height='84' viewBox='0 0 120 120'><g fill='none' stroke='%23ffffff' stroke-width='2' opacity='0.035' stroke-linecap='round'><circle cx='20' cy='22' r='7'/><path d='M70 14l8 8m0-8l-8 8'/><path d='M96 60c6-8 14 0 8 6l-8 8-8-8c-6-6 2-14 8-6z'/><rect x='14' y='74' width='16' height='12' rx='3'/><path d='M52 96q8-10 16 0'/><path d='M44 50l6-6 6 6'/></g></svg>\")";

function Ticks() {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" aria-hidden className="text-[#53bdeb]">
      <path d="M1 5.5l3 3L10.5 2M6 8.5l1 1L14.5 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Bubble({ from, time, children }: Msg) {
  const mine = from === 'customer';
  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <div className={`relative max-w-[82%] rounded-[10px] px-2.5 pb-1.5 pt-1.5 text-[13.5px] leading-[1.35] text-[#e9edef] shadow-[0_1px_0.5px_rgb(0_0_0/0.3)] ${mine ? 'rounded-tr-[3px] bg-[#005c4b]' : 'rounded-tl-[3px] bg-[#202c33]'}`}>
        {children}
        <span className="float-right ml-2 mt-1.5 inline-flex translate-y-1 items-center gap-1 text-[10.5px] leading-none text-[#8696a0]">
          {time}{mine && <Ticks />}
        </span>
      </div>
    </div>
  );
}

export function WhatsAppPhone({ shop, initials, messages }: { shop: string; initials: string; messages: Msg[] }) {
  return (
    <div className="relative w-[300px] rounded-[54px] border border-white/15 bg-[#0d0d0f] p-[11px] shadow-[0_50px_100px_-30px_rgb(0_0_0/0.9),inset_0_0_0_1px_rgb(255_255_255/0.04)] sm:w-[340px]">
      <div className="relative flex aspect-[9/19.3] flex-col overflow-hidden rounded-[44px] bg-[#0b141a]">
        {/* status bar + dynamic island */}
        <div className="relative z-10 flex h-[50px] shrink-0 items-center justify-between bg-[#1f2c34] px-[30px] pt-1 text-[14px] font-semibold text-white">
          <span>9:41</span>
          <span className="absolute left-1/2 top-[11px] h-[27px] w-[92px] -translate-x-1/2 rounded-full bg-black" />
          <span className="flex items-center gap-1.5" aria-hidden>
            <svg width="17" height="11" viewBox="0 0 26 18" fill="currentColor"><rect y="12" width="4" height="6" rx="1" /><rect x="7" y="8" width="4" height="10" rx="1" /><rect x="14" y="4" width="4" height="14" rx="1" /><rect x="21" width="4" height="18" rx="1" /></svg>
            <svg width="24" height="11" viewBox="0 0 38 18"><rect x="0.5" y="0.5" width="33" height="17" rx="5" fill="none" stroke="currentColor" opacity="0.4" /><rect x="3" y="3" width="25" height="12" rx="3" fill="currentColor" /></svg>
          </span>
        </div>

        {/* chat header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-black/40 bg-[#1f2c34] px-3 pb-2.5 pt-1">
          <svg width="10" height="17" viewBox="0 0 10 17" aria-hidden><path d="M8.5 1.5L2 8.5l6.5 7" fill="none" stroke="#e9edef" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d97706] text-[13px] font-semibold text-white">{initials}</span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[15px] font-medium text-[#e9edef]">{shop}</span>
            <span className="block text-[11.5px] text-[#8696a0]">Business account</span>
          </span>
<span className="flex items-center gap-4 text-[#aebac1]" aria-hidden><Video className="size-[19px]" strokeWidth={1.75} /><Phone className="size-[17px]" strokeWidth={1.75} /></span>
        </div>

        {/* messages */}
        <div className="flex flex-1 flex-col gap-1.5 overflow-hidden px-3 pt-3" style={{ backgroundImage: wallpaper }}>
          <span className="mx-auto mb-1.5 rounded-md bg-[#182229] px-2.5 py-1 text-[11px] text-[#8696a0]">Today</span>
          <p className="mx-auto mb-2 max-w-[88%] rounded-md bg-[#182229] px-2.5 py-1.5 text-center text-[10.5px] leading-snug text-[#ffd279]">
            This business uses a secure service from Meta to manage this chat.
          </p>
          {messages.map((m, i) => <Bubble key={i} {...m} />)}
        </div>

        {/* message bar */}
        <div className="flex shrink-0 items-center gap-2 bg-[#0b141a] px-2 pb-6 pt-2" aria-hidden>
          <span className="flex h-9 flex-1 items-center gap-2.5 rounded-full bg-[#1f2c34] px-3 text-[13.5px] text-[#8696a0]">
            <Smile className="size-[18px]" strokeWidth={1.75} />
            <span className="flex-1">Message</span>
            <Paperclip className="size-[17px]" strokeWidth={1.75} />
            <Camera className="size-[17px]" strokeWidth={1.75} />
          </span>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#0b141a]"><Mic className="size-[18px]" strokeWidth={2} /></span>
        </div>
      </div>
    </div>
  );
}
