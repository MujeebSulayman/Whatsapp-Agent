import { ArrowRight, Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/app-shell';

export const metadata: Metadata = {
  title: 'Converso: an AI salesperson for your WhatsApp',
  description: 'Converso answers your WhatsApp customers in their own language, takes orders and bookings, and calls you in when a chat needs a person.'
};

const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_URL ?? '/privacy';
const TERMS_URL = process.env.NEXT_PUBLIC_TERMS_URL ?? '/terms';

const cta = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium transition-colors';
const primary = `${cta} bg-primary text-primary-foreground hover:bg-primary/90`;
const secondary = `${cta} border border-white/15 text-foreground hover:bg-white/5`;

const steps = [
  { n: '01', t: 'Tell it about your business', d: 'Paste your price list, snap a photo of your menu, or answer a few questions. It drafts your products, delivery areas and FAQs. You check everything before it goes live.' },
  { n: '02', t: 'Connect your WhatsApp number', d: 'Customers keep messaging the number they already know. Your assistant answers in seconds, any hour, in English, Pidgin or whatever language they write in.' },
  { n: '03', t: 'Watch the orders come in', d: 'Orders and booking requests land in your dashboard with the customer, items and address. When a chat needs you, it is flagged and handed over.' }
];

const features = [
  { t: 'Quotes only what is true', d: 'Prices, stock and delivery fees come from your catalogue, never from the AI’s imagination. If it does not know, it says so and asks you.' },
  { t: 'Speaks like your customers', d: 'It replies in the language and tone the customer uses, and in the voice you set: friendly, professional, playful or formal.' },
  { t: 'Hands over when it should', d: 'Complaints, big orders and the words you choose pull you into the chat. Take over from the inbox and the AI steps aside.' },
  { t: 'You set the limits', d: 'A maximum discount it can never exceed, topics it must avoid, and standing instructions in your own words. Practice it first; nothing is sent to a real customer.' },
  { t: 'Goods, services or both', d: 'Sell products with stock, or quote jobs and take bookings. Works for food, fashion, beauty, repairs, cleaning, HVAC and more.' },
  { t: 'Built for any country', d: 'Your currency, your timezone, your delivery areas. Nothing assumes one country.' }
];

const faqs = [
  { q: 'Do my customers need to install anything?', a: 'No. They message your WhatsApp number as usual. Converso works behind it.' },
  { q: 'Can it get a price or a delivery fee wrong?', a: 'It is only allowed to quote what is in your catalogue and delivery areas. If something is missing it hands the chat to you instead of guessing.' },
  { q: 'What if a customer is upset or asks for a person?', a: 'The chat is flagged and handed over to you or your team, and the AI stops replying until you hand it back.' },
  { q: 'Do I need to be technical to set it up?', a: 'No. You can paste a price list or photograph a menu and review what it drafts. You approve everything before it is saved.' },
  { q: 'Is my customers’ data safe?', a: 'Every business is kept separate from every other. Messages are sent to our AI provider to write replies. You can delete your business and its data at any time from settings.' }
];

export default function LandingPage() {
  return (
    <div className="theme-dark min-h-dvh overflow-x-clip scroll-smooth bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="Converso home"><Logo /></Link>
          <nav className="hidden items-center gap-8 text-[14px] text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden h-9 items-center rounded-lg px-3 text-[14px] text-muted-foreground transition-colors hover:text-foreground sm:inline-flex">Sign in</Link>
            <Link href="/signup" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90">Get started</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: the same lit horizon as the sign-in screens, sitting under the headline */}
        <section className="relative">
          <div aria-hidden className="absolute inset-0 [&_.horizon]:h-full [&_.horizon]:min-h-0 [&_.horizon-flare]:top-[74%]! [&_.horizon-glow]:top-[74%]! [&_.horizon-planet]:top-[74%]!">
            <div className="horizon"><div className="horizon-stars" /><div className="horizon-glow" /><div className="horizon-planet" /><div className="horizon-flare" /><div className="horizon-fade" /></div>
          </div>
          <div className="relative mx-auto max-w-4xl px-5 pb-40 pt-20 text-center sm:pt-28 lg:pb-56 lg:pt-36">
            <p className="mb-5 text-[13px] font-medium uppercase tracking-[0.14em] text-muted-foreground">AI sales agent for WhatsApp</p>
            <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-[56px] lg:text-[72px]">Never miss a sale because you replied late.</h1>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">
              Converso answers your WhatsApp customers in seconds, in their own language, takes their orders or bookings, and calls you in when a chat needs a person.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className={primary}>Start free<ArrowRight className="size-4" /></Link>
              <a href="#how" className={secondary}>See how it works</a>
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground">No card needed. Set up in an evening.</p>
          </div>
        </section>

        {/* Product: an example chat and the order it produced */}
        <section className="relative mx-auto -mt-24 max-w-6xl px-5 lg:-mt-40">
          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <div className="rounded-2xl border border-white/10 bg-card p-5 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)] sm:p-6">
              <div className="mb-4 flex items-center justify-between text-[12px] text-muted-foreground">
                <span>Example chat on WhatsApp</span><span>9:41 pm</span>
              </div>
              <div className="space-y-3 text-[14px] leading-relaxed">
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5">abeg how much be party pack, and delivery to Ajah?</div>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-white/10 px-4 py-2.5">Good evening! The Party Pack (serves 10) is ₦12,000. Delivery to Ajah is ₦2,500, about 90 minutes. Make I put one for you?</div>
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5">Yes abeg. 5 Admiralty Way</div>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-white/10 px-4 py-2.5">Done. 1 Party Pack to 5 Admiralty Way, total ₦14,500. Send the transfer and I will confirm your order.</div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-card p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">In your dashboard</span>
                <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-[12px] text-warning">Awaiting payment</span>
              </div>
              <div className="text-[15px] font-medium">New order</div>
              <dl className="mt-4 divide-y divide-white/10 text-[14px]">
                <div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Party Pack × 1</dt><dd>₦12,000</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-muted-foreground">Delivery, Ajah</dt><dd>₦2,500</dd></div>
                <div className="flex justify-between py-2.5 font-medium"><dt>Total</dt><dd>₦14,500</dd></div>
                <div className="py-2.5"><dt className="text-muted-foreground">Deliver to</dt><dd className="mt-0.5">5 Admiralty Way</dd></div>
              </dl>
              <p className="mt-2 text-[12px] text-muted-foreground">Illustration. Every price here came from the shop’s catalogue.</p>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-5 pt-28 lg:pt-40">
          <h2 className="max-w-2xl text-[30px] font-semibold leading-tight tracking-tight sm:text-[40px]">From price list to taking orders, in three steps.</h2>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="bg-black p-7">
                <div className="font-mono text-[13px] text-muted-foreground">{s.n}</div>
                <h3 className="mt-6 text-[18px] font-medium">{s.t}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-5 pt-28 lg:pt-40">
          <h2 className="max-w-2xl text-[30px] font-semibold leading-tight tracking-tight sm:text-[40px]">Helpful to customers. Careful with your business.</h2>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">An assistant that sells is only useful if you can trust it. These limits are built in, not bolted on.</p>
          <div className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.t} className="border-t border-white/10 pt-5">
                <h3 className="text-[17px] font-medium">{f.t}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pt-28 lg:pt-40">
          <div className="grid items-start gap-10 rounded-2xl border border-white/10 bg-card p-8 sm:p-12 lg:grid-cols-2">
            <div>
              <h2 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[36px]">You stay in charge of every conversation.</h2>
              <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">Read any chat, jump in whenever you like, and turn the assistant off for one customer or for the whole business with a single switch.</p>
            </div>
            <ul className="space-y-3.5 text-[15px]">
              {['Practice chat: test your assistant as a customer, nothing is sent', 'Teach it from mistakes: correct an answer and it becomes a rule', 'A daily AI spend cap per business, so costs never surprise you', 'Your team gets their own logins, owners control settings'].map((t) => (
                <li key={t} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={2} /><span>{t}</span></li>
              ))}
            </ul>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-5 pt-28 lg:pt-40">
          <h2 className="text-[30px] font-semibold leading-tight tracking-tight sm:text-[40px]">Questions</h2>
          <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
            {faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex list-none items-center justify-between gap-6 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}<span aria-hidden className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="relative mx-auto mt-28 max-w-6xl px-5 pb-28 text-center lg:mt-40">
          <h2 className="mx-auto max-w-2xl text-[32px] font-semibold leading-tight tracking-tight sm:text-[44px]">Let your next customer get an answer in seconds.</h2>
          <div className="mt-8 flex justify-center"><Link href="/signup" className={primary}>Create your account<ArrowRight className="size-4" /></Link></div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-[13px] text-muted-foreground sm:flex-row">
          <Logo textClassName="text-[14px]" />
          <div className="flex items-center gap-6">
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
