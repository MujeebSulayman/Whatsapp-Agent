import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/app-shell';

const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_URL ?? '/privacy';
const TERMS_URL = process.env.NEXT_PUBLIC_TERMS_URL ?? '/terms';

/** The lit edge of a planet against black: the only decoration on the sign-in screens. */
function Horizon() {
  return (
    <div aria-hidden className="horizon">
      <div className="horizon-stars" />
      <div className="horizon-glow" />
      <div className="horizon-planet" />
      <div className="horizon-flare" />
      <div className="horizon-fade" />
    </div>
  );
}

/**
 * Phones: one column, the horizon art as a backdrop behind the form.
 * Desktop (lg and up): a split screen. The art, logo and headline fill the left half; the form sits centred on the right.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="theme-dark relative min-h-dvh overflow-x-clip bg-background text-foreground lg:grid lg:grid-cols-2">
      <div className="absolute inset-x-0 top-0 lg:sticky lg:inset-x-auto lg:top-0 lg:h-dvh lg:self-start lg:overflow-hidden lg:border-r lg:border-white/10">
        <Horizon />
        <div className="relative hidden flex-col justify-between p-12 xl:p-16 lg:flex lg:h-full">
          <Logo className="animate-fade-in gap-3" markClassName="size-10" textClassName="text-[24px]" />
          <div className="max-w-[480px]">
            <h2 className="animate-rise-lg text-[44px] font-semibold leading-[1.08] tracking-tight [animation-delay:500ms] xl:text-[52px]">Never miss a sale because you replied late.</h2>
            <p className="animate-rise-lg mt-5 max-w-[420px] text-[17px] leading-relaxed text-muted-foreground [animation-delay:700ms]">An AI salesperson for your WhatsApp. It answers questions, takes orders and bookings, and calls you in when it should.</p>
          </div>
        </div>
      </div>

      <main className="relative mx-auto flex min-h-dvh w-full max-w-[360px] flex-col px-4 pb-8 pt-[max(44vh,280px)] lg:max-w-[480px] lg:px-6 lg:pt-10 lg:[&_label>span:first-child]:text-[15px]">
        <Logo className="mb-10 justify-center gap-3 lg:hidden" markClassName="size-9" textClassName="text-[22px]" />
        <div className="flex-1 lg:my-auto lg:flex-none">{children}</div>
        <footer className="mt-10 flex justify-center gap-6 text-[12px] text-muted-foreground lg:mt-12 lg:gap-8 lg:text-[14px]">
          <Link href={PRIVACY_URL} className="transition-colors hover:text-foreground">Privacy policy</Link>
          <Link href={TERMS_URL} className="transition-colors hover:text-foreground">Terms of service</Link>
        </footer>
      </main>
    </div>
  );
}
