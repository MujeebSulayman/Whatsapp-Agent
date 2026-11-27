'use client';
import { BarChart3, Bot, Loader2, LogOut, Menu, MessageSquare, Package, Rocket, ShoppingBag, Store, Users, UsersRound, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { api, useApi } from '@/lib/api';
import type { BusinessDetail, Me } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLabels } from '@/lib/use-labels';
import { Avatar, Badge, ThemeToggle } from './ui';

const main = [
  { href: '/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 }
];
const settings = [
  { href: '/ai-settings', label: 'AI assistant', icon: Bot },
  { href: '/business', label: 'Business', icon: Store },
  { href: '/team', label: 'Team', icon: UsersRound }
];

export function BrandMark({ className = 'size-8' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34D399" /><stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <path transform="translate(1.6 -0.6)" d="M22.01 9.99A8.5 8.5 0 0 0 7.79 18.2L6.2 25.8l5.55-2.44A8.5 8.5 0 0 0 22.01 22.01"
        fill="none" stroke="#fff" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-tight">{process.env.NEXT_PUBLIC_APP_NAME ?? 'Converso'}</span>
    </div>
  );
}

function NavLink({ href, label, icon: Icon, onNavigate }: { href: string; label: string; icon: typeof Bot; onNavigate: () => void }) {
  const active = usePathname().startsWith(href);
  return (
    <Link href={href} onClick={onNavigate}
      className={cn('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors', active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>
      <Icon className="size-4" />{label}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { data: me } = useApi<Me>('auth/me');
  const { data: biz } = useApi<BusinessDetail>('business');
  const labels = useLabels();
  const close = () => setOpen(false);
  const setupDone = biz ? Object.values(biz.setup).every(Boolean) : true;

  async function logout() {
    await api.post('auth/logout').catch(() => {});
    router.replace('/login');
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between border-b px-4"><Logo /><button className="md:hidden" onClick={close} aria-label="Close menu"><X className="size-5" /></button></div>
      <nav className="flex-1 space-y-6 overflow-y-auto p-3">
        {!setupDone && (
          <Link href="/onboarding" onClick={close} className={cn('flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm font-medium', pathname.startsWith('/onboarding') ? 'bg-muted' : 'bg-card hover:bg-muted/60')}>
            <Rocket className="size-4" />Finish setup
          </Link>
        )}
        <div className="space-y-0.5">{main.map((i) => <NavLink key={i.href} {...i} label={i.href === '/orders' ? labels.orders : i.href === '/products' ? labels.items : i.label} onNavigate={close} />)}</div>
        <div>
          <div className="mb-1.5 px-3 text-xs font-medium text-muted-foreground">Configure</div>
          <div className="space-y-0.5">{settings.map((i) => <NavLink key={i.href} {...i} onNavigate={close} />)}</div>
        </div>
      </nav>
      <div className="space-y-3 border-t p-3">
        {biz?.plan === 'trial' && biz.trialDaysLeft !== null && (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs"><span className="text-muted-foreground">Free trial</span><Badge tone="dark">{biz.trialDaysLeft} days left</Badge></div>
        )}
        <div className="flex items-center gap-2.5">
          <Avatar name={me?.user.name ?? me?.user.email} className="size-8" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{me?.user.name ?? '…'}</div>
            <div className="truncate text-xs text-muted-foreground">{me?.business.name}</div>
          </div>
          <ThemeToggle />
          <button onClick={logout} aria-label="Sign out" title="Sign out" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="size-4" /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen md:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-card md:block">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={close} />}
      <aside className={cn('fixed inset-y-0 left-0 z-50 w-64 border-r bg-card transition-transform md:hidden', open ? 'translate-x-0' : '-translate-x-full')}>{sidebar}</aside>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card px-4 md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button><Logo />
      </header>
      <main className={pathname.startsWith('/inbox') ? 'w-full' : 'mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8'}>{!me && !biz ? <div className="flex justify-center py-24"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div> : children}</main>
    </div>
  );
}
