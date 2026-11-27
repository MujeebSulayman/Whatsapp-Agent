'use client';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, ErrorNote, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { COUNTRIES, countryByCode, currencyOptions, defaultCurrency, guessCountry, guessTimezone, timezonesForCountry } from '@/lib/countries';
import { cn } from '@/lib/utils';

const CATEGORIES = ['Food & drinks', 'Fashion & thrift', 'Beauty & skincare', 'Gadgets & electronics', 'Home & lifestyle', 'Other'];

function strength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12 || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return { score, label: pw.length === 0 ? '' : ['Too short', 'Okay', 'Good', 'Strong'][pw.length < 8 ? 0 : score] ?? '' };
}

export default function SignupPage() {
  const router = useRouter();
  const [f, setF] = useState({ name: '', businessName: '', category: CATEGORIES[0]!, city: '', country: '', currency: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Built in the browser only: Node and Chrome ship different ICU currency names, which would break hydration.
  const [tzChoice, setTzChoice] = useState('');
  const [currencies, setCurrencies] = useState<{ code: string; label: string }[]>([]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const pw = strength(f.password);
  const country = countryByCode(f.country);
  // Timezone: the owner's own if it belongs to the chosen country; automatic for single-zone countries; otherwise ask.
  const zones = f.country ? timezonesForCountry(f.country) : [];
  const mine = f.country ? guessTimezone() : '';
  const autoZone = !f.country ? '' : zones.length === 0 ? 'UTC' : zones.length === 1 ? zones[0]! : zones.includes(mine) ? mine : '';
  const timezone = autoZone || tzChoice;
  const needsTz = !!f.country && !autoZone;

  // Pre-select the visitor's country and timezone from their browser; they can change both.
  useEffect(() => {
    setCurrencies(currencyOptions());
    const guess = guessCountry();
    if (guess) setF((s) => ({ ...s, country: guess, currency: defaultCurrency(guess) || s.currency }));
  }, []);

  function pickCountry(code: string) {
    setTzChoice('');
    setF((s) => ({ ...s, country: code, currency: defaultCurrency(code) || s.currency }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.country) return setError('Please choose your country.');
    if (!f.currency) return setError('Please choose your currency.');
    if (!timezone) return setError('Please choose your timezone.');
    setBusy(true);
    setError(null);
    try {
      await api.post('auth/signup', { ...f, timezone });
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
          <Field label="Category"><Select value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country">
              <Select required value={f.country} onChange={(e) => pickCountry(e.target.value)} aria-label="Country">
                <option value="" disabled>Select country…</option>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
              </Select>
            </Field>
            <Field label="City"><Input required minLength={2} value={f.city} onChange={set('city')} placeholder="e.g. Accra" /></Field>
          </div>
          {needsTz && (
            <Field label="Timezone" hint="Your country has several timezones. Pick the one your business runs on.">
              <Select required value={tzChoice} onChange={(e) => setTzChoice(e.target.value)} aria-label="Timezone">
                <option value="" disabled>Select timezone…</option>
                {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Currency" hint={country ? `Prices are set and shown in this currency. Chosen from ${country.name}; you can change it now, but not after you add products.` : 'The currency you sell in.'}>
            <Select required value={f.currency} onChange={set('currency')} aria-label="Currency">
              <option value="" disabled>Select currency…</option>
              {currencies.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </Select>
          </Field>
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
        </fieldset>

        <Button type="submit" className="h-10 w-full" loading={busy}>Create account</Button>
        <p className="text-center text-xs text-muted-foreground">You can connect WhatsApp and add products right after signing up.</p>
      </form>

      <p className="mt-8 border-t pt-6 text-center text-[13px] text-muted-foreground">
        Already have an account? <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
