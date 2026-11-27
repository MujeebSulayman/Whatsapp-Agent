import { CheckCheck, Clock, HandHelping, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/app-shell';
import { ThemeToggle } from '@/components/ui';

const points = [
  { icon: Clock, title: 'Replies in seconds, 24/7', body: 'In your customers’ own language, day and night.' },
  { icon: ShieldCheck, title: 'Only your real prices and stock', body: 'It never guesses a price, fee or time.' },
  { icon: HandHelping, title: 'You stay in control', body: 'Take over any chat in one click.' }
];

/** A looping-free, staggered example chat: each line fades in after the previous one. */
function ExampleChat() {
  const delay = (s: number) => ({ animationDelay: `${s}s` });
  return (
    <figure aria-label="Example conversation" className="animate-drift w-full max-w-[420px] rounded-2xl border bg-card/80 p-4 shadow-2xl shadow-black/30 backdrop-blur">
      <figcaption className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="size-1.5 rounded-full bg-brand" />Example chat
      </figcaption>
      <div className="space-y-2.5 text-[13px]">
        <div className="animate-fade-up max-w-[82%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2" style={delay(0.3)}>Hi! How much is the party pack?</div>
        <div className="animate-fade-up ml-auto max-w-[82%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-primary-foreground" style={delay(1.1)}>The Party Pack (serves 10) is $24. Delivery to Downtown is $4. Want me to place the order?</div>
        <div className="animate-fade-up max-w-[82%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2" style={delay(2.2)}>Yes please, 12 Market Road.</div>
        <div className="animate-fade-up ml-auto flex w-fit items-center gap-1.5 rounded-2xl rounded-br-sm bg-muted px-3.5 py-2.5" style={delay(3)} aria-hidden>
          {[0, 1, 2].map((i) => <span key={i} className="typing-dot size-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.18}s` }} />)}
        </div>
        <div className="animate-fade-up rounded-xl border border-brand/30 bg-brand/10 px-3.5 py-2.5" style={delay(4)}>
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-brand"><CheckCheck className="size-3.5" />Order placed</div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">1 × Party Pack · delivery $4 · total $28</div>
        </div>
      </div>
    </figure>
  );
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r bg-background lg:block">
        {/* soft glows + a faint grid that fades out toward the edges */}
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-[520px] rounded-full bg-brand/15 blur-[120px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-[-80px] size-[460px] rounded-full bg-brand/10 blur-[120px]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_72%)]" />

        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />

          <div className="max-w-md">
            <h2 className="text-[34px] font-semibold leading-[1.15] tracking-tight">Never miss a sale because you replied late.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">An AI salesperson that runs your WhatsApp: answers questions, takes orders and bookings, and hands over when you are needed.</p>
            <ul className="mt-9 space-y-4">
              {points.map((p) => (
                <li key={p.title} className="flex items-start gap-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-brand"><p.icon className="size-4" /></span>
                  <div><div className="text-sm font-medium">{p.title}</div><p className="text-[13px] text-muted-foreground">{p.body}</p></div>
                </li>
              ))}
            </ul>
          </div>

          <ExampleChat />
        </div>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-5 py-10">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="mb-8 lg:hidden"><Logo /></div>
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
