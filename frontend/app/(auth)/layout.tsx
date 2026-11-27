import { CheckCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/app-shell';
import { ThemeToggle } from '@/components/ui';

const points = [
  { title: 'Answers at 11pm, not tomorrow', body: 'After-hours customers get a price, not a "we will get back to you".' },
  { title: 'Quotes your numbers, never its own', body: 'Prices, stock and fees come from your catalogue, never from a guess.' },
  { title: 'Hands over when it matters', body: 'Refunds and anything uncertain reach you with a summary.' }
];

/** A looping-free, staggered example chat: each line fades in after the previous one. */
function ExampleChat() {
  const delay = (s: number) => ({ animationDelay: `${s}s` });
  return (
    <figure aria-label="Example conversation" className="w-full max-w-[420px] rounded-2xl border bg-card/80 p-4 shadow-2xl shadow-black/30 backdrop-blur">
      <figcaption className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">Example chat</figcaption>
      <div className="space-y-2.5 text-[13px]">
        <div className="animate-fade-up max-w-[82%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2" style={delay(0.3)}>Hi! How much is the party pack?</div>
        <div className="animate-fade-up ml-auto max-w-[82%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-primary-foreground" style={delay(1.1)}>The Party Pack (serves 10) is $24. Delivery to Downtown is $4. Want me to place the order?</div>
        <div className="animate-fade-up max-w-[82%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2" style={delay(2.2)}>Yes please, 12 Market Road.</div>
        <div className="animate-fade-up rounded-xl border border-brand/30 bg-brand/10 px-3.5 py-2.5" style={delay(3.2)}>
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

        <div className="relative flex h-full flex-col justify-between gap-10 p-12">
          <Logo />

          <div className="max-w-md">
            <h2 className="text-[34px] font-semibold leading-[1.15] tracking-tight">Never miss a sale because you replied late.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">An AI salesperson for your WhatsApp. It answers questions, takes orders and bookings, and calls you in when it should.</p>
            <ul className="mt-10 divide-y border-y">
              {points.map((p) => (
                <li key={p.title} className="py-3.5">
                  <div className="text-sm font-medium">{p.title}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* On short screens the example chat is dropped so the rest never gets cramped. */}
          <div className="hidden [@media(min-height:860px)]:block"><ExampleChat /></div>
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
