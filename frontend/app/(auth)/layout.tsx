import type { ReactNode } from 'react';
import { Logo } from '@/components/app-shell';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-8"><Logo /></div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 text-xs text-muted-foreground">Your AI salesperson on WhatsApp, 24/7.</p>
    </div>
  );
}
