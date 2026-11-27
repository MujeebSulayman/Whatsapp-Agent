'use client';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('auth/login', { email, password });
      router.replace('/inbox');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <h1 className="text-[26px] font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-8 mt-1.5 text-sm text-muted-foreground">Sign in to your dashboard.</p>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Email"><Input className="h-11 rounded-lg" type="email" autoFocus autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" /></Field>
        <Field label="Password">
          <div className="relative">
            <Input className="h-11 rounded-lg pr-10" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2.5 top-3 rounded p-0.5 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" className="h-11 w-full rounded-lg" loading={busy}>Sign in<ArrowRight className="size-4" /></Button>
      </form>
      <p className="mt-8 border-t pt-6 text-center text-[13px] text-muted-foreground">
        New here? <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">Create an account</Link>
      </p>
    </div>
  );
}
