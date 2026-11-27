'use client';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthButton, AuthInput, AuthOptions, BackLink, SwitchLink, rememberMethod, useProviders } from '@/components/auth/google-button';
import { ErrorNote } from '@/components/ui';
import { api } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const urlError = useSearchParams().get('error');
  const providers = useProviders();
  const [wantsEmail, setWantsEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // First screen: the quick options. Email is one click away, and is the only option when nothing else is set up.
  const choosing = providers.offer && !wantsEmail;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('auth/login', { email, password });
      rememberMethod('email');
      router.replace('/inbox');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      <h1 className="sr-only">Sign in</h1>
      {(urlError || error) && <ErrorNote>{error ?? urlError}</ErrorNote>}

      {providers.loading ? (
        <div className="h-[100px]" aria-hidden />
      ) : choosing ? (
        <AuthOptions preview={providers.preview} onEmail={() => setWantsEmail(true)} />
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <AuthInput type="email" aria-label="Email" autoFocus autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <div className="relative">
            <AuthInput className="pr-11" type={show ? 'text' : 'password'} aria-label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/40 transition-colors hover:text-white lg:right-4">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <AuthButton type="submit" tone="light" loading={busy}>Sign in</AuthButton>
          {providers.offer && <div className="pt-2"><BackLink onClick={() => setWantsEmail(false)} /></div>}
        </form>
      )}

      <SwitchLink prompt="New here?" href="/signup" label="Create an account" />
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
