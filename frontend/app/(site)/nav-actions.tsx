'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const external = (url: string) => (/^https?:/.test(url) ? { target: '_blank', rel: 'noreferrer' } : {});

/** True once the element with `id` has scrolled up under the nav. */
function usePastHero(id: string) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const target = document.getElementById(id);
    if (!target || typeof IntersectionObserver === 'undefined') return setPast(true);
    const io = new IntersectionObserver(([e]) => setPast(!e?.isIntersecting), { rootMargin: '-64px 0px 0px 0px' });
    io.observe(target);
    return () => io.disconnect();
  }, [id]);
  return past;
}

/**
 * The right side of the nav. Get started / Contact us appear only once the hero's own buttons have scrolled away,
 * so the two sets are never on screen together; on phones only Get started fits. Below md there is also a menu
 * button that opens a full-width panel with the section links.
 */
export function NavActions({ contactUrl, watchId, links }: { contactUrl: string; watchId: string; links: { href: string; label: string }[] }) {
  const past = usePastHero(watchId);
  const [open, setOpen] = useState(false);

  // While the menu is open: lock the page scroll, close on Escape, and close if the screen grows to desktop.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const mq = window.matchMedia('(min-width: 768px)');
    const onMq = () => mq.matches && setOpen(false);
    window.addEventListener('keydown', onKey);
    mq.addEventListener('change', onMq);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); mq.removeEventListener('change', onMq); };
  }, [open]);

  const show = past && !open;
  return (
    <>
      <div className="flex items-center gap-2">
        <div
          inert={!show}
          className={`flex items-center gap-2 transition-all duration-300 motion-reduce:transition-none ${show ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'}`}
        >
          <a href={contactUrl} {...external(contactUrl)} className="hidden h-9 items-center rounded-lg border border-white/15 px-4 text-[14px] text-foreground transition-colors hover:bg-white/5 sm:inline-flex">Contact us</a>
          <Link href="/signup" className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4">Get started</Link>
        </div>
        <button
          type="button" onClick={() => setOpen((o) => !o)}
          aria-expanded={open} aria-controls="site-menu" aria-label={open ? 'Close menu' : 'Open menu'}
          className="-mr-1.5 grid size-10 place-items-center rounded-lg text-foreground transition-colors hover:bg-white/5 md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Rendered into <body>: the header's backdrop blur would otherwise trap a fixed panel inside its 64px. */}
      {open && createPortal(
        <div id="site-menu" className="theme-dark fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col overflow-y-auto bg-black px-4 pb-8 pt-2 text-foreground md:hidden">
          <nav className="flex flex-col">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="border-b border-white/10 py-4 text-[20px] font-medium tracking-[-0.01em]">{l.label}</a>
            ))}
            <a href={contactUrl} {...external(contactUrl)} onClick={() => setOpen(false)} className="border-b border-white/10 py-4 text-[20px] font-medium tracking-[-0.01em]">Contact us</a>
          </nav>
          <div className="mt-auto grid gap-3">
            <Link href="/signup" onClick={() => setOpen(false)} className="inline-flex h-12 items-center justify-center rounded-lg bg-primary text-[16px] font-medium text-primary-foreground">Get started</Link>
            <Link href="/login" onClick={() => setOpen(false)} className="inline-flex h-12 items-center justify-center rounded-lg border border-white/15 text-[16px]">Sign in</Link>
            <p className="mt-1 text-center text-[13px] text-muted-foreground">14-day free trial. No card needed.</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
