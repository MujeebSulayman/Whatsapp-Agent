'use client';
import { BarChart3, Bot, ListChecks, Loader2, LogOut, Menu, MessageSquare, Package, Rocket, ShoppingBag, Sparkles, Store, Users, UsersRound, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api, useApi } from '@/lib/api';
import type { BusinessDetail, Me } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLabels } from '@/lib/use-labels';
import { Avatar, ThemeToggle } from './ui';

/* Grouped by job: what you check every day, the records of what you sell, then setup. */
type NavItem = { href: string; label: string; icon: typeof Bot };
const groups: { title?: string; items: NavItem[] }[] = [
  { items: [
    { href: '/inbox', label: 'Inbox', icon: MessageSquare },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 }
  ] },
  { title: 'Sales', items: [
    { href: '/orders', label: 'Orders', icon: ShoppingBag },
    { href: '/products', label: 'Products', icon: Package },
    { href: '/customers', label: 'Customers', icon: Users }
  ] },
  { title: 'Settings', items: [
    { href: '/setup', label: 'AI setup', icon: Sparkles },
    { href: '/ai-settings', label: 'AI assistant', icon: Bot },
    { href: '/playbooks', label: 'Playbooks', icon: ListChecks },
    { href: '/business', label: 'Business', icon: Store },
    { href: '/team', label: 'Team', icon: UsersRound }
  ] }
];

/**
 * The Converso mark, "two voices": two open arcs facing each other, you (the text colour) and your customer (emerald).
 * Drawn in a square frame so the existing square size classes keep working; the neutral arc follows the theme.
 */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} aria-hidden="true" fill="none" strokeWidth="6" strokeLinecap="round">
      <g transform="translate(0 6)">
        <path d="M23.33 8.69A14 14 0 1 0 23.33 35.31" stroke="currentColor" />
        <path d="M32.67 8.69A14 14 0 1 1 32.67 35.31" stroke="#10b981" />
      </g>
    </svg>
  );
}

export function Logo({ className, markClassName, textClassName }: { className?: string; markClassName?: string; textClassName?: string } = {}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark className={markClassName} />
      <span className={cn('text-[15px] font-semibold tracking-tight', textClassName)}>{process.env.NEXT_PUBLIC_APP_NAME ?? 'Converso'}</span>
    </div>
  );
}

function NavLink({ href, label, icon: Icon, onNavigate }: { href: string; label: string; icon: typeof Bot; onNavigate: () => void }) {
  const active = usePathname().startsWith(href);
  return (
    <Link href={href} onClick={onNavigate}
      className={cn('group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors', active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')}>
      <Icon className={cn('size-4 shrink-0', active ? 'text-foreground' : 'text-muted-foreground/80 group-hover:text-foreground')} strokeWidth={1.75} />{label}
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
      <div className="flex h-14 items-center justify-between px-4"><Logo markClassName="size-7" /><button className="md:hidden" onClick={close} aria-label="Close menu"><X className="size-5" /></button></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {!setupDone && (
          <Link href="/onboarding" onClick={close} className={cn('flex h-8 items-center gap-2.5 rounded-md border px-2.5 text-[13px] font-medium', pathname.startsWith('/onboarding') ? 'bg-muted' : 'bg-card hover:bg-muted/60')}>
            <Rocket className="size-4 text-brand" strokeWidth={1.75} />Finish setup
          </Link>
        )}
        {groups.map((g) => (
          <div key={g.title ?? 'main'}>
            {g.title && <div className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{g.title}</div>}
            <div className="space-y-0.5">
              {g.items.map((i) => <NavLink key={i.href} {...i} label={i.href === '/orders' ? labels.orders : i.href === '/products' ? labels.items : i.label} onNavigate={close} />)}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-2 p-3">
        {biz?.plan === 'trial' && biz.trialDaysLeft !== null && (
          <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground"><span className="size-1.5 rounded-full bg-brand" />Free trial</span>
            <span className="font-medium tabular-nums">{biz.trialDaysLeft} days left</span>
          </div>
        )}
        <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border/60 bg-background md:block">{sidebar}</aside>
      {open && <div className="animate-fade-in fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden" onClick={close} />}
      <aside className={cn('fixed inset-y-0 left-0 z-50 w-64 border-r bg-background transition-transform duration-300 ease-[var(--ease-out)] md:hidden', open ? 'translate-x-0' : '-translate-x-full')}>{sidebar}</aside>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button><Logo />
      </header>
      <main className={pathname.startsWith('/inbox') ? 'w-full' : 'mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8'}>{!me && !biz ? <div className="flex justify-center py-24"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div> : <div key={pathname} className="animate-page">{children}</div>}</main>
    </div>
  );
}
