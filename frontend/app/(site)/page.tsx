import { Check, Clock, FileText, Globe, Inbox, Languages, ShoppingBag, Smartphone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/app-shell';
import { HandoverVisual, LimitsVisual, NoGuessingVisual } from './feature-visuals';
import { NavActions } from './nav-actions';
import { WhatsAppPhone } from './whatsapp-phone';

export const metadata: Metadata = {
  title: 'Converso: an AI salesperson for your WhatsApp',
  description: 'Converso answers your WhatsApp customers in their own language, takes orders and bookings, and calls you in when a chat needs a person.'
};

const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_URL ?? '/privacy';
const TERMS_URL = process.env.NEXT_PUBLIC_TERMS_URL ?? '/terms';
/** Where "Contact us" goes: a wa.me link, a mailto: or a form. Without one it scrolls to the closing section. */
const CONTACT_URL = process.env.NEXT_PUBLIC_CONTACT_URL || '#contact';
const contactProps = /^https?:/.test(CONTACT_URL) ? { target: '_blank', rel: 'noreferrer' } : {};

const btn = 'inline-flex h-11 items-center justify-center rounded-lg px-5 text-[15px] font-medium transition-[color,background-color,transform] duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]';
const primary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`;
const secondary = `${btn} border border-white/15 text-foreground hover:bg-white/5`;
const navLinks = [{ href: '#how', label: 'How it works' }, { href: '#features', label: 'Features' }, { href: '#faq', label: 'FAQ' }];
const h2 = 'text-[28px] font-medium leading-tight tracking-[-0.02em] sm:text-[36px]';

const steps = [
  { n: '01', icon: FileText, t: 'Tell it about your business', d: 'Paste your price list, snap a photo of your menu, or answer a few questions. It drafts your products, delivery areas and FAQs. You check everything before it goes live.' },
  { n: '02', icon: Smartphone, t: 'Connect your WhatsApp number', d: 'Customers keep messaging the number they already know. Your assistant answers in seconds, any hour, in English, Pidgin or whatever language they write in.' },
  { n: '03', icon: Inbox, t: 'Watch the orders come in', d: 'Orders and booking requests land in your dashboard with the customer, items and address. When a chat needs you, it is flagged and handed over.' }
];

/* The three that matter most get a row each, with a slice of the product beside the words. */
const featureRows = [
  { Visual: NoGuessingVisual, t: 'Quotes only what is true', d: 'Prices, stock and delivery fees come from your catalogue, never from the AI’s imagination. If something is missing, it says so and asks you instead of guessing.' },
  { Visual: HandoverVisual, t: 'Hands over when it should', d: 'Complaints, refunds, big orders and the words you choose pull you into the chat, with a summary so you do not have to scroll back. Take over from the inbox and the AI steps aside.' },
  { Visual: LimitsVisual, t: 'You set the limits', d: 'A maximum discount it can never exceed, topics it must avoid, and standing instructions in your own words. Practice it first; nothing is sent to a real customer.' }
];

const moreFeatures = [
  { icon: Languages, t: 'Speaks like your customers', d: 'It replies in the language and tone the customer uses, and in the voice you set: friendly, professional, playful or formal.' },
  { icon: ShoppingBag, t: 'Goods, services or both', d: 'Sell products with stock, or quote jobs and take bookings. Works for food, fashion, beauty, repairs, cleaning, HVAC and more.' },
  { icon: Globe, t: 'Built for any country', d: 'Your currency, your timezone, your delivery areas. Nothing assumes one country.' }
];

const faqs = [
  { q: 'Do my customers need to install anything?', a: 'No. They message your WhatsApp number as usual. Converso works behind it.' },
  { q: 'Can it get a price or a delivery fee wrong?', a: 'It is only allowed to quote what is in your catalogue and delivery areas. If something is missing it hands the chat to you instead of guessing.' },
  { q: 'What if a customer is upset or asks for a person?', a: 'The chat is flagged and handed over to you or your team, and the AI stops replying until you hand it back.' },
  { q: 'Do I need to be technical to set it up?', a: 'No. You can paste a price list or photograph a menu and review what it drafts. You approve everything before it is saved.' },
  { q: 'Is my customers’ data safe?', a: 'Every business is kept separate from every other. Messages are sent to our AI provider to write replies. You can delete your business and its data at any time from settings.' }
];

/** The lit planet edge from the sign-in screens. `className` sets --h, how far down the section the horizon sits. */
function Horizon({ className }: { className: string }) {
  return (
    <div aria-hidden className={`absolute inset-0 [&_.horizon]:h-full [&_.horizon]:min-h-0 ${className}`}>
      <div className="horizon [&>.horizon-flare]:top-[var(--h)]! [&>.horizon-glow]:top-[var(--h)]! [&>.horizon-planet]:top-[var(--h)]!">
        <div className="horizon-stars" /><div className="horizon-glow" /><div className="horizon-planet" /><div className="horizon-flare" /><div className="horizon-fade" />
      </div>
    </div>
  );
}

/** A small card floating beside the phone: what Converso is doing on the shop's side. Desktop only. */
function Widget({ className, icon, title, line }: { className: string; icon: ReactNode; title: string; line: string }) {
  return (
    <div className={`absolute z-10 hidden w-[230px] items-center gap-3 rounded-xl border border-white/10 bg-[#111113]/90 p-3 shadow-[0_20px_40px_-20px_rgb(0_0_0/0.8)] backdrop-blur md:flex ${className}`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-foreground">{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[13.5px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{line}</span>
      </span>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="theme-dark min-h-dvh overflow-x-clip scroll-smooth bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
          <Link href="/" aria-label="Converso home"><Logo /></Link>
          <nav className="hidden items-center gap-8 text-[14px] text-muted-foreground md:flex">
            {navLinks.map((l) => <a key={l.href} href={l.href} className="transition-colors hover:text-foreground">{l.label}</a>)}
          </nav>
          <NavActions contactUrl={CONTACT_URL} watchId="hero-actions" links={navLinks} />
        </div>
      </header>

      <main>
        {/* Hero, in one column: headline, trial note, description, buttons, then the customer's phone rising out of the horizon */}
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="max-sm:hidden"><Horizon className="[--h:60%] lg:[--h:57%]" /></div>
          <div className="relative mx-auto max-w-6xl px-4 pt-12 sm:px-5 sm:pt-20 lg:pt-24">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="animate-rise-lg text-[34px] font-medium leading-[1.1] tracking-[-0.025em] [animation-delay:100ms] sm:text-[52px] lg:text-[60px]">
                An AI salesperson for your WhatsApp.
              </h1>
              <p className="animate-rise-lg mt-4 text-[14px] text-muted-foreground [animation-delay:250ms]">14-day free trial. No card needed.</p>
              <p className="animate-rise-lg [animation-delay:350ms] mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground sm:mt-6 sm:text-[17px]">
                It answers your customers on WhatsApp in seconds, quotes from your own price list and takes the order, day or night. When a chat needs you, it hands it over.
              </p>
              <div id="hero-actions" className="animate-rise-lg [animation-delay:500ms] mt-7 grid grid-cols-2 gap-3 sm:mt-8 sm:flex sm:justify-center">
                <Link href="/signup" className={primary}>Get started</Link>
                <a href={CONTACT_URL} {...contactProps} className={secondary}>Contact us</a>
              </div>
            </div>

            <div className="relative mx-auto mt-10 flex max-w-4xl justify-center sm:mt-14 lg:mt-16">
              {/* What happens on your side while the customer chats */}
              <Widget className="animate-rise-lg left-0 top-[22%] [animation-delay:4.1s]" icon={<ShoppingBag className="size-4" strokeWidth={1.75} />} title="New order #K7T2Q4" line="Air Runner, size 44 × 1 · ₦48,000" />
              <Widget className="animate-rise-lg right-0 top-[48%] [animation-delay:1.9s]" icon={<Clock className="size-4" strokeWidth={1.75} />} title="Replied in 3 seconds" line="9:41 PM, after closing time" />
              <div className="phone-rise pb-12 sm:pb-24">
                <WhatsAppPhone animate shop="Urban Sole" initials="US" messages={[
                  { from: 'customer', time: '9:41 PM', children: 'Good evening, do you have the Air Runner in size 43?' },
                  { from: 'shop', time: '9:41 PM', children: <>Good evening! 👋 Size 43 is sold out, but I have 42 and 44 in stock, both <b className="font-semibold">₦45,000</b>. Want to see the black one in 44?</> },
                  { from: 'customer', time: '9:42 PM', children: 'Yes abeg, 44. Deliver to Ikeja' },
                  { from: 'shop', time: '9:42 PM', children: <>Delivery to Ikeja is <b className="font-semibold">₦3,000</b>, about 1–2 days. Your total is <b className="font-semibold">₦48,000</b>. What’s your full address?</> },
                  { from: 'customer', time: '9:43 PM', children: '14 Allen Avenue' },
                  { from: 'shop', time: '9:43 PM', children: <>Done ✅ Order <b className="font-semibold">#K7T2Q4</b> is placed. Send the transfer and we’ll confirm it right away.</> }
                ]} />
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 sm:px-5 sm:pt-28 lg:pt-40">
          <h2 className={`reveal max-w-2xl ${h2}`}>From price list to taking orders, in three steps.</h2>
          <ol className="-mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:mt-12 md:mx-0 md:grid md:snap-none md:grid-cols-3 md:gap-px md:overflow-hidden md:rounded-2xl md:border md:border-white/10 md:bg-white/10 md:p-0 [&::-webkit-scrollbar]:hidden">
            {steps.map((s) => (
              <li key={s.n} className="reveal w-[82%] shrink-0 snap-start rounded-2xl border border-white/10 bg-[#0a0a0b] p-6 md:w-auto transition-colors duration-300 hover:bg-[#0f0f11] md:rounded-none md:border-0 md:bg-black md:p-7">
                <div className="flex items-center justify-between text-muted-foreground">
                  <s.icon className="size-5" strokeWidth={1.5} />
                  <span className="font-mono text-[13px]">{s.n}</span>
                </div>
                <h3 className="mt-6 text-[17px] font-medium md:mt-7">{s.t}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-center text-[12px] text-muted-foreground md:hidden">Swipe to see all three steps</p>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 sm:px-5 sm:pt-28 lg:pt-40">
          <h2 className={`reveal max-w-2xl ${h2}`}>Helpful to customers. Careful with your business.</h2>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">An assistant that sells is only useful if you can trust it. These limits are built in, not bolted on.</p>
          <div className="mt-12 space-y-16 sm:mt-16 sm:space-y-20 lg:mt-20 lg:space-y-28">
            {featureRows.map((f, i) => (
              <div key={f.t} className="reveal grid items-center gap-6 sm:gap-8 lg:grid-cols-2 lg:gap-16">
                <div className={i % 2 ? 'lg:order-2' : ''}>
                  <h3 className="text-[20px] font-medium tracking-[-0.01em] sm:text-[24px]">{f.t}</h3>
                  <p className="mt-2.5 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:mt-3 sm:text-[16px]">{f.d}</p>
                </div>
                <div className={i % 2 ? 'lg:order-1' : ''}><f.Visual /></div>
              </div>
            ))}
          </div>
          <div className="mt-16 grid gap-x-12 gap-y-7 border-t border-white/10 pt-8 sm:mt-20 sm:grid-cols-3 sm:gap-y-10 sm:pt-10 lg:mt-28">
            {moreFeatures.map((f) => (
              <div key={f.t} className="reveal flex gap-4 sm:block">
                <f.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <div>
                  <h3 className="text-[16px] font-medium sm:mt-4 sm:text-[17px]">{f.t}</h3>
                  <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground sm:mt-2.5 sm:text-[15px]">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-5 sm:pt-28 lg:pt-40">
          <div className="reveal grid items-start gap-8 rounded-2xl border border-white/10 bg-card p-6 sm:gap-10 sm:p-12 lg:grid-cols-2">
            <div>
              <h2 className={h2}>You stay in charge of every conversation.</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">Read any chat, jump in whenever you like, and turn the assistant off for one customer or for the whole business with a single switch.</p>
            </div>
            <ul className="divide-y divide-white/10 text-[15px]">
              {['Practice chat: test your assistant as a customer, nothing is sent', 'Teach it from mistakes: correct an answer and it becomes a rule', 'Switch the assistant off for your whole business, or take over any single chat, at any time', 'Your team gets their own logins, owners control settings'].map((t) => (
                <li key={t} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={2} /><span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-20 sm:px-5 sm:pt-28 lg:pt-40">
          <h2 className={`reveal ${h2}`}>Questions</h2>
          <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
            {faqs.map((f) => (
              <details key={f.q} className="group py-4 sm:py-5">
                <summary className="flex list-none items-center justify-between gap-6 text-[16px] font-medium sm:text-[17px] [&::-webkit-details-marker]:hidden">
                  {f.q}<span aria-hidden className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:mt-3">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-[15px] text-muted-foreground">
            Something else? <a href={CONTACT_URL} {...contactProps} className="text-foreground underline underline-offset-4 decoration-white/30 hover:decoration-white">Contact us</a>.
          </p>
        </section>

        {/* Closing call to action: the horizon again, so the page ends where it began */}
        <section id="contact" className="relative mt-20 scroll-mt-20 overflow-hidden sm:mt-28 lg:mt-40">
          <Horizon className="[--h:80%] sm:[--h:76%] lg:[--h:70%]" />
          <div className="relative mx-auto max-w-6xl px-4 pb-32 pt-12 text-center sm:px-5 sm:pb-44 sm:pt-24 lg:pb-56">
            <h2 className={`reveal mx-auto max-w-xl ${h2} sm:text-[40px]`}>Let your next customer get an answer in seconds.</h2>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-9 sm:flex sm:justify-center">
              <Link href="/signup" className={primary}>Get started</Link>
              <a href={CONTACT_URL} {...contactProps} className={secondary}>Contact us</a>
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground">14-day free trial. No card needed.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-[13px] text-muted-foreground sm:flex-row sm:px-5">
          <Logo textClassName="text-[14px]" />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href="/login" className="transition-colors hover:text-foreground">Sign in</Link>
            <Link href={PRIVACY_URL} className="transition-colors hover:text-foreground">Privacy policy</Link>
            <Link href={TERMS_URL} className="transition-colors hover:text-foreground">Terms of service</Link>
          </div>
          <span>© {new Date().getFullYear()} Converso</span>
        </div>
      </footer>
    </div>
  );
}
