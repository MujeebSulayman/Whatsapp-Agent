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

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="theme-dark relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <Horizon />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-[360px] flex-col px-4 pb-8 pt-[max(44vh,280px)]">
        <Logo className="mb-10 justify-center gap-3" markClassName="size-9" textClassName="text-[22px]" />
        <div className="flex-1">{children}</div>
        <footer className="mt-10 flex justify-center gap-6 text-[12px] text-muted-foreground">
          <Link href={PRIVACY_URL} className="transition-colors hover:text-foreground">Privacy policy</Link>
          <Link href={TERMS_URL} className="transition-colors hover:text-foreground">Terms of service</Link>
        </footer>
      </main>
    </div>
  );
}
