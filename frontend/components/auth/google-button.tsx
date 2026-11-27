'use client';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { ErrorNote } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Which sign-in methods the server has set up. A method that isn't configured is simply not offered. */
export function useProviders() {
  const { data, isLoading } = useApi<{ google: boolean }>('auth/providers', { revalidateOnFocus: false });
  const google = !!data?.google;
  // While building (never in production) the button is shown even before Google is set up, so the screen can be reviewed.
  const preview = !google && process.env.NODE_ENV !== 'production';
  return { google, preview, offer: google || preview, loading: isLoading };
}

/* ---------- "Last used" memory (this browser only) ---------- */
type Method = 'google' | 'email';
const LAST_KEY = 'auth:last-method';
export function rememberMethod(m: Method) {
  try { localStorage.setItem(LAST_KEY, m); } catch { /* private mode: no badge, nothing breaks */ }
}
function useLastMethod(): Method | null {
  const [last, setLast] = useState<Method | null>(null);
  useEffect(() => {
    try { const v = localStorage.getItem(LAST_KEY); if (v === 'google' || v === 'email') setLast(v); } catch { /* ignore */ }
  }, []);
  return last;
}

/* ---------- Pieces in the sign-in screen's style ---------- */
export function AuthButton({ tone = 'dark', badge, loading, className, children, disabled, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'light' | 'dark'; badge?: string | null; loading?: boolean }) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'relative flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-medium lg:h-14 lg:gap-2.5 lg:rounded-2xl lg:text-[16px] transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60',
        tone === 'light' ? 'bg-white text-black hover:bg-white/90' : 'bg-white/[0.09] text-white hover:bg-white/[0.14]',
        className
      )}
      {...p}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
      {badge && <span className="absolute -top-2 right-3 rounded-full border border-white/10 bg-zinc-800 px-2 py-0.5 text-[10px] lg:text-[11px] font-medium leading-none text-white/90 shadow-sm">{badge}</span>}
    </button>
  );
}

/*
 * Floating-label field: the placeholder text is the label. It sits in the middle of the box, then glides up and
 * shrinks once the field has focus or a value (including browser autofill), so the label never disappears.
 */
export function AuthInput({ className, placeholder, id, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="relative">
      <input id={fid} placeholder=" "
        className={cn(
          'peer h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 pt-4 text-[14px] text-white outline-none lg:h-14 lg:rounded-2xl lg:px-5 lg:pt-5 lg:text-[16px]',
          'shadow-[inset_0_1px_0_rgb(255_255_255/0.03)] transition-[border-color,background-color,box-shadow] duration-200',
          'hover:border-white/20 focus-visible:border-white/40 focus-visible:bg-white/[0.06] focus-visible:ring-4 focus-visible:ring-white/[0.06]',
          'aria-[invalid=true]:border-danger/60 aria-[invalid=true]:focus-visible:ring-danger/10',
          !placeholder && 'pt-0 lg:pt-0',
          className
        )}
        {...p} />
      {placeholder && (
        <label htmlFor={fid}
          className={cn(
            'pointer-events-none absolute left-3.5 top-1/2 origin-left -translate-y-1/2 text-[14px] text-white/40 transition-all duration-200 ease-[var(--ease-out)] lg:left-5 lg:text-[16px]',
            'peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:text-white/55 lg:peer-focus:top-3.5 lg:peer-focus:text-[12px]',
            'peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11px] lg:peer-[:not(:placeholder-shown)]:top-3.5 lg:peer-[:not(:placeholder-shown)]:text-[12px]',
            'peer-autofill:top-3 peer-autofill:translate-y-0 peer-autofill:text-[11px] peer-autofill:text-white/55 lg:peer-autofill:top-3.5 lg:peer-autofill:text-[12px]'
          )}>
          {placeholder}
        </label>
      )}
    </div>
  );
}

export function BackLink({ onClick, children = 'All options' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mx-auto flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground lg:text-[15px]">
      <ArrowLeft className="size-3.5 lg:size-4" />{children}
    </button>
  );
}

export function SwitchLink({ prompt, href, label }: { prompt: string; href: string; label: string }) {
  return (
    <p className="text-center text-[13px] text-muted-foreground lg:text-[15px]">
      {prompt} <Link href={href} className="text-foreground underline-offset-4 hover:underline">{label}</Link>
    </p>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-[17px] lg:size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * The first screen for both sign-in and sign-up: one stack of "Continue with…" buttons, no headings.
 * Google works for new and returning people alike; email leads to the page's own form.
 */
export function AuthOptions({ preview, onEmail }: { preview: boolean; onEmail: () => void }) {
  const last = useLastMethod();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function google() {
    if (preview) return setError('Google sign-in is not set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env (steps in backend/docs/GOOGLE-SIGNIN.md). This note only appears while developing.');
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.get<{ url: string }>('auth/google/start');
      rememberMethod('google');
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 lg:space-y-4">
      <AuthButton tone="light" loading={busy} onClick={google} badge={last === 'google' ? 'Last used' : null}>
        {!busy && <GoogleMark />}Continue with Google
      </AuthButton>
      <AuthButton onClick={onEmail} badge={last === 'email' ? 'Last used' : null}>
        Continue with email
      </AuthButton>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
