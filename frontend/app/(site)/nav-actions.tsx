'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Get started / Contact us in the nav, shown only once the hero's own buttons have scrolled out of view,
 * so the two sets never sit on screen together. If scripts fail they stay hidden, and the hero's buttons still work.
 */
export function NavActions({ contactUrl, watchId }: { contactUrl: string; watchId: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const target = document.getElementById(watchId);
    if (!target || typeof IntersectionObserver === 'undefined') return setShow(true);
    const io = new IntersectionObserver(([e]) => setShow(!e?.isIntersecting), { rootMargin: '-64px 0px 0px 0px' });
    io.observe(target);
    return () => io.disconnect();
  }, [watchId]);

  const external = /^https?:/.test(contactUrl) ? { target: '_blank', rel: 'noreferrer' } : {};
  return (
    <div
      inert={!show}
      className={`flex items-center gap-2 transition-all duration-300 motion-reduce:transition-none ${show ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'}`}
    >
      <a href={contactUrl} {...external} className="inline-flex h-9 items-center rounded-lg border border-white/15 px-3 text-[14px] text-foreground transition-colors hover:bg-white/5 sm:px-4">Contact us</a>
      <Link href="/signup" className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4">Get started</Link>
    </div>
  );
}
