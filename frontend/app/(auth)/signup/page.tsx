'use client';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, ErrorNote, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { CATEGORIES, CUSTOM_CATEGORY, KIND_OPTIONS, kindFor, type Kind } from '@/lib/categories';
import { COUNTRIES, autoTimezone } from '@/lib/countries';
import { cn } from '@/lib/utils';

function strength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12 || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return { score, label: pw.length === 0 ? '' : ['Too short', 'Okay', 'Good', 'Strong'][pw.length < 8 ? 0 : score] ?? '' };
}

export default function SignupPage() {
  const router = useRouter();
  const [f, setF] = useState({ name: '', businessName: '', city: '', country: 'NG', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [categoryChoice, setCategoryChoice] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [kind, setKind] = useState<Kind>('goods');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const pw = strength(f.password);
  const category = categoryChoice === CUSTOM_CATEGORY ? customCategory.trim() : categoryChoice;


  function pickCountry(code: string) {
    setF((s) => ({ ...s, country: code }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.country) return setError('Please choose your country.');
    if (f.password !== confirm) return setError("The two passwords don't match.");
    if (category.length < 2) return setError('Please choose or type what your business does.');
    setBusy(true);
    setError(null);
    try {
      await api.post('auth/signup', { ...f, category, kind, timezone: autoTimezone(f.country) });
      router.replace('/onboarding');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-7 mt-1.5 text-sm text-muted-foreground">Start your 14-day free trial. No card needed.</p>

      <form onSubmit={submit} className="space-y-6">
        {error && <ErrorNote>{error}</ErrorNote>}

        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Your business</legend>
          <Field label="Business name"><Input required minLength={2} value={f.businessName} onChange={set('businessName')} placeholder="e.g. Sunrise Bakery" /></Field>
          <Field label="What does your business do?">
            <Select required value={categoryChoice} aria-label="Business category" onChange={(e) => { const v = e.target.value; setCategoryChoice(v); const k = kindFor(v); if (k) setKind(k); }}>
              <option value="" disabled>Choose a category…</option>
              {CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              <option value={CUSTOM_CATEGORY}>Other (type your own)</option>
            </Select>
          </Field>
          {categoryChoice === CUSTOM_CATEGORY && (
            <Field label="Your business type"><Input required minLength={2} maxLength={60} autoFocus value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="e.g. Drone photography, Boat repair…" /></Field>
          )}
          <Field label="How do customers buy from you?" hint={KIND_OPTIONS.find((o) => o.value === kind)?.hint}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Business type">
              {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country">
              <Select required value={f.country} onChange={(e) => pickCountry(e.target.value)} aria-label="Country">
                <option value="" disabled>Select country…</option>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
              </Select>
            </Field>
            <Field label="City"><Input required minLength={2} value={f.city} onChange={set('city')} placeholder="e.g. Lagos" /></Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Your login</legend>
          <Field label="Your name"><Input required value={f.name} onChange={set('name')} autoComplete="name" /></Field>
          <Field label="Email"><Input type="email" required value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@business.com" /></Field>
          <Field label="Password">
            <div className="relative">
              <Input type={show ? 'text' : 'password'} required minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" className="pr-10" />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1">{[1, 2, 3].map((i) => <span key={i} className={cn('h-1 flex-1 rounded-full', f.password.length >= 8 && pw.score >= i ? 'bg-primary' : 'bg-muted')} />)}</div>
              <span className="w-16 text-right text-xs text-muted-foreground">{pw.label || 'Min. 8 characters'}</span>
            </div>
          </Field>
          <Field label="Confirm password" error={confirm.length > 0 && confirm !== f.password ? "Passwords don't match" : null}>
            <Input type={show ? 'text' : 'password'} required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" aria-invalid={confirm.length > 0 && confirm !== f.password} />
          </Field>
        </fieldset>

        <Button type="submit" className="h-10 w-full" loading={busy}>Create account</Button>
        <p className="text-center text-xs text-muted-foreground">You can connect WhatsApp and add what you sell right after signing up.</p>
      </form>

      <p className="mt-8 border-t pt-6 text-center text-[13px] text-muted-foreground">
        Already have an account? <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
