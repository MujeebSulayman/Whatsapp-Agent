'use client';
import {
  ArrowLeft, ArrowRight, Briefcase, Car, Check, Eye, EyeOff, GraduationCap, HeartPulse, Plane, Shapes, Shirt, Smartphone, Sparkles, Store, UtensilsCrossed, Wrench,
  type LucideIcon
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, ErrorNote, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { CATEGORIES, CUSTOM_CATEGORY, KIND_OPTIONS, kindFor, type Kind } from '@/lib/categories';
import { COUNTRIES, autoTimezone } from '@/lib/countries';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  'Food & drink': UtensilsCrossed,
  'Fashion & accessories': Shirt,
  'Beauty & personal care': Sparkles,
  'Electronics & gadgets': Smartphone,
  'Home & general retail': Store,
  'Home services (HVAC, plumbing, painting…)': Wrench,
  'Auto & transport': Car,
  'Health & wellness': HeartPulse,
  'Professional services': Briefcase,
  'Events, travel & hospitality': Plane,
  'Education & training': GraduationCap
};

/** "Home services (HVAC, plumbing…)" -> title + examples, so the cards stay short. */
const splitName = (name: string): { title: string; examples?: string } => {
  const m = name.match(/^(.*?)\s*\((.*)\)$/);
  return m ? { title: m[1]!, examples: m[2]! } : { title: name };
};

function strength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12 || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return { score, label: pw.length === 0 ? '' : ['Too short', 'Okay', 'Good', 'Strong'][pw.length < 8 ? 0 : score] ?? '' };
}

const inputClass = 'h-11 rounded-lg';

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [f, setF] = useState({ name: '', email: '', password: '', businessName: '', city: '', country: 'NG' });
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [categoryChoice, setCategoryChoice] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [kind, setKind] = useState<Kind>('goods');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const pw = strength(f.password);
  const category = categoryChoice === CUSTOM_CATEGORY ? customCategory.trim() : categoryChoice;
  const mismatch = confirm.length > 0 && confirm !== f.password;

  const step1Ok = f.name.trim().length > 0 && /^\S+@\S+\.\S+$/.test(f.email) && f.password.length >= 8 && confirm === f.password;
  const step2Ok = f.businessName.trim().length >= 2 && category.length >= 2 && f.city.trim().length >= 2 && !!f.country;

  function pickCategory(name: string) {
    setCategoryChoice(name);
    const k = kindFor(name);
    if (k) setKind(k);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === 1) {
      if (f.password !== confirm) return setError("The two passwords don't match.");
      if (step1Ok) setStep(2);
      return;
    }
    if (!step2Ok) return setError('Please complete every field.');
    setBusy(true);
    try {
      await api.post('auth/signup', { name: f.name, email: f.email, password: f.password, businessName: f.businessName, city: f.city, country: f.country, category, kind, timezone: autoTimezone(f.country) });
      router.replace('/onboarding');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      {/* progress */}
      <div className="mb-8 flex items-center gap-3" aria-label={`Step ${step} of 2`}>
        <div className="flex flex-1 gap-1.5">
          {[1, 2].map((i) => <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors duration-500', step >= i ? 'bg-brand' : 'bg-muted')} />)}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">Step {step} of 2</span>
      </div>

      <form onSubmit={submit} key={step} className="animate-fade-up space-y-6">
        {step === 1 ? (
          <>
            <div>
              <h1 className="text-[26px] font-semibold tracking-tight">Create your account</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">Start your 14-day free trial. No card needed.</p>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="space-y-4">
              <Field label="Your name"><Input className={inputClass} required autoFocus value={f.name} onChange={set('name')} autoComplete="name" placeholder="Ada Okafor" /></Field>
              <Field label="Work email"><Input className={inputClass} type="email" required value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@business.com" /></Field>
              <Field label="Password">
                <div className="relative">
                  <Input className={cn(inputClass, 'pr-10')} type={show ? 'text' : 'password'} required minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" />
                  <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2.5 top-3 rounded p-0.5 text-muted-foreground hover:text-foreground">
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex flex-1 gap-1">{[1, 2, 3].map((i) => <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', f.password.length >= 8 && pw.score >= i ? 'bg-brand' : 'bg-muted')} />)}</div>
                  <span className="w-20 text-right text-xs text-muted-foreground">{pw.label || '8+ characters'}</span>
                </div>
              </Field>
              <Field label="Confirm password" error={mismatch ? "Passwords don't match" : null}>
                <Input className={inputClass} type={show ? 'text' : 'password'} required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" aria-invalid={mismatch} />
              </Field>
            </div>
            <Button type="submit" className="h-11 w-full rounded-lg" disabled={!step1Ok}>Continue<ArrowRight className="size-4" /></Button>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-[26px] font-semibold tracking-tight">Tell us about your business</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">This sets up your assistant. You can change it any time.</p>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}

            <Field label="Business name"><Input className={inputClass} required autoFocus minLength={2} value={f.businessName} onChange={set('businessName')} placeholder="e.g. Sunrise Bakery" /></Field>

            <div>
              <div className="mb-2 text-[13px] font-medium">What does your business do?</div>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Business category">
                {CATEGORIES.map((c) => {
                  const { title, examples } = splitName(c.name);
                  const Icon = ICONS[c.name] ?? Shapes;
                  const on = categoryChoice === c.name;
                  return (
                    <button key={c.name} type="button" aria-pressed={on} onClick={() => pickCategory(c.name)}
                      className={cn('group relative flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/60', on ? 'border-brand bg-brand/10' : 'bg-card')}>
                      <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md', on ? 'bg-brand/20 text-brand' : 'bg-muted text-muted-foreground group-hover:text-foreground')}><Icon className="size-3.5" /></span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium leading-snug">{title}</span>
                        {examples && <span className="block truncate text-[11px] text-muted-foreground">{examples}</span>}
                      </span>
                      {on && <Check className="absolute right-2 top-2 size-3.5 text-brand" />}
                    </button>
                  );
                })}
                <button type="button" aria-pressed={categoryChoice === CUSTOM_CATEGORY} onClick={() => pickCategory(CUSTOM_CATEGORY)}
                  className={cn('group relative flex items-center gap-2.5 rounded-lg border border-dashed p-2.5 text-left transition-colors hover:bg-muted/60', categoryChoice === CUSTOM_CATEGORY ? 'border-brand bg-brand/10' : 'bg-card')}>
                  <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', categoryChoice === CUSTOM_CATEGORY ? 'bg-brand/20 text-brand' : 'bg-muted text-muted-foreground')}><Shapes className="size-3.5" /></span>
                  <span className="text-[13px] font-medium">Other</span>
                </button>
              </div>
              {categoryChoice === CUSTOM_CATEGORY && (
                <div className="animate-fade-up mt-2"><Input className={inputClass} required autoFocus minLength={2} maxLength={60} value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="e.g. Drone photography, Boat repair…" aria-label="Your business type" /></div>
              )}
            </div>

            <div>
              <div className="mb-2 text-[13px] font-medium">How do customers buy from you?</div>
              <div className="grid grid-cols-3 gap-1 rounded-lg border bg-card p-1" role="radiogroup" aria-label="Business type">
                {KIND_OPTIONS.map((o) => (
                  <button key={o.value} type="button" role="radio" aria-checked={kind === o.value} onClick={() => setKind(o.value)}
                    className={cn('rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors', kind === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                    {o.value === 'both' ? 'Both' : o.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{KIND_OPTIONS.find((o) => o.value === kind)?.hint}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Country">
                <Select className={inputClass} required value={f.country} onChange={set('country')} aria-label="Country">
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </Select>
              </Field>
              <Field label="City"><Input className={inputClass} required minLength={2} value={f.city} onChange={set('city')} placeholder="e.g. Lagos" /></Field>
            </div>

            <div className="flex gap-2.5">
              <Button type="button" variant="secondary" className="h-11 rounded-lg px-4" onClick={() => { setError(null); setStep(1); }} aria-label="Back"><ArrowLeft className="size-4" /></Button>
              <Button type="submit" className="h-11 flex-1 rounded-lg" loading={busy} disabled={!step2Ok}>Create account</Button>
            </div>
          </>
        )}
      </form>

      <p className="mt-8 border-t pt-6 text-center text-[13px] text-muted-foreground">
        Already have an account? <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
