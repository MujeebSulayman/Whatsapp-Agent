import { Clock, HandHelping, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/app-shell';
import { ThemeToggle } from '@/components/ui';

const points = [
  { icon: Clock, title: 'Replies in seconds, 24/7', body: 'English or Pidgin, day and night, so no customer waits.' },
  { icon: ShieldCheck, title: 'Only your real prices and stock', body: 'It never guesses a price, fee or delivery time.' },
  { icon: HandHelping, title: 'You stay in control', body: 'Tricky chats go to you. Take over any conversation in one click.' }
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden flex-col justify-between border-r bg-card p-12 lg:flex">
        <Logo />

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Never miss a sale because you replied late.</h2>
          <p className="mt-3 text-[15px] text-muted-foreground">An AI salesperson that runs your WhatsApp: answers questions, takes orders and hands over when you are needed.</p>

          <ul className="mt-10 space-y-5">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><p.icon className="size-4" /></span>
                <div><div className="text-sm font-medium">{p.title}</div><p className="mt-0.5 text-[13px] text-muted-foreground">{p.body}</p></div>
              </li>
            ))}
          </ul>
        </div>

        <figure className="max-w-md rounded-xl border bg-background/60 p-4" aria-label="Example conversation">
          <figcaption className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">Example chat</figcaption>
          <div className="space-y-2 text-[13px]">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2">abeg how much be party pack?</div>
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground">The Party Pack (serves 10) na ₦12,000. Delivery to Lekki Phase 1 na ₦2,000. You wan order?</div>
          </div>
        </figure>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-5 py-10">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="mb-8 lg:hidden"><Logo /></div>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
