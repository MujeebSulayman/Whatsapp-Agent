'use client';
import {
  ArrowLeft, ArrowRight, Briefcase, Car, Check, Eye, EyeOff, GraduationCap, HeartPulse, Mail, Plane, Shapes, Shirt, Smartphone, Sparkles, Store, UtensilsCrossed, Wrench,
  type LucideIcon
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { GoogleButton, OrDivider, useProviders } from '@/components/auth/google-button';
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

function SignupForm() {
  const router = useRouter();
  const socialTicket = useSearchParams().get('social');
  const providers = useProviders();
  const [wantsEmail, setWantsEmail] = useState(false);
  const [social, setSocial] = useState<{ email: string; name: string | null } | null>(null);
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

  // Coming back from Google as a brand-new person: we already know who they are, so skip straight to the business step.
  useEffect(() => {
    if (!socialTicket) return;
    api.post<{ pending?: { email: string; name: string | null } }>('auth/social/exchange', { ticket: socialTicket })
      .then((r) => { if (r.pending) { setSocial(r.pending); setStep(2); } else router.replace('/inbox'); })
      .catch((e: Error) => router.replace(`/login?error=${encodeURIComponent(e.message)}`));
  }, [socialTicket, router]);

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
    const business = { businessName: f.businessName, city: f.city, country: f.country, category, kind, timezone: autoTimezone(f.country) };
    try {
      if (social && socialTicket) await api.post('auth/social/complete', { ticket: socialTicket, ...business });
      else await api.post('auth/signup', { name: f.name, email: f.email, password: f.password, ...business });
      router.replace('/onboarding');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  // First screen: quick options, with email one click away. Hidden when we are finishing a Google sign-up.
  if (!socialTicket && !providers.loading && providers.offer && !wantsEmail) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-semibold tracking-tight">Create your account</h1>
        <p className="mb-8 mt-1.5 text-sm text-muted-foreground">Start your 14-day free trial. No card needed.</p>
        <div className="space-y-4">
          <GoogleButton preview={providers.preview} />
          <OrDivider />
          <Button type="button" variant="secondary" className="h-11 w-full rounded-lg" onClick={() => setWantsEmail(true)}><Mail className="size-4" />Continue with email</Button>
        </div>
        <p className="mt-8 border-t pt-6 text-center text-[13px] text-muted-foreground">
          Already have an account? <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link>
        </p>
      </div>
    );
  }
  if (providers.loading || (socialTicket && !social)) return <div className="h-64" aria-hidden />;

  const totalSteps = social ? 1 : 2;
  const shownStep = social ? 1 : step;

  return (
    <div>
      {/* progress (not needed when Google already gave us the account step) */}
      {!social && (
      <div className="mb-8 flex items-center gap-3" aria-label={`Step ${shownStep} of ${totalSteps}`}>
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((i) => <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors duration-500', shownStep >= i ? 'bg-brand' : 'bg-muted')} />)}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">Step {shownStep} of {totalSteps}</span>
      </div>
      )}

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
            {providers.offer && <button type="button" onClick={() => setWantsEmail(false)} className="w-full text-center text-[13px] text-muted-foreground hover:text-foreground">Other sign-up options</button>}
          </>
        ) : (
          <>
            <div>
              <h1 className="text-[26px] font-semibold tracking-tight">{social ? 'One last step' : 'Tell us about your business'}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">This sets up your assistant. You can change it any time.</p>
              {social && <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-[13px]"><Check className="size-3.5 shrink-0 text-brand" /><span className="truncate">Signed in with Google as <strong className="font-medium">{social.email}</strong></span></p>}
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
              {!social && <Button type="button" variant="secondary" className="h-11 rounded-lg px-4" onClick={() => { setError(null); setStep(1); }} aria-label="Back"><ArrowLeft className="size-4" /></Button>}
              <Button type="submit" className="h-11 flex-1 rounded-lg" loading={busy} disabled={!step2Ok}>Create account</Button>
            </div>
          </>
        )}
      </form>

      <p className="mt-8 border-t pt-6 text-center text-[13px] text-muted-foreground">
        {social ? <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">Use a different account</Link> : <>Already have an account? <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link></>}
      </p>
    </div>
  );
}

export default function SignupPage() {
  return <Suspense fallback={null}><SignupForm /></Suspense>;
}
