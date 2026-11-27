'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card, CardBody, ErrorNote, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';

const CATEGORIES = ['Food & drinks', 'Fashion & thrift', 'Beauty & skincare', 'Gadgets & electronics', 'Home & lifestyle', 'Other'];

export default function SignupPage() {
  const router = useRouter();
  const [f, setF] = useState({ name: '', businessName: '', category: CATEGORIES[0]!, city: 'Lagos', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('auth/signup', f);
      router.replace('/onboarding');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <h1 className="text-lg font-semibold tracking-tight">Create your account</h1>
        <p className="mb-5 mt-1 text-[13px] text-muted-foreground">14-day free trial. No card needed.</p>
        <form onSubmit={submit} className="space-y-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field label="Your name"><Input required value={f.name} onChange={set('name')} autoComplete="name" /></Field>
          <Field label="Business name"><Input required minLength={2} value={f.businessName} onChange={set('businessName')} placeholder="e.g. Lekki Small Chops" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><Select value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="City"><Input required value={f.city} onChange={set('city')} /></Field>
          </div>
          <Field label="Email"><Input type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></Field>
          <Field label="Password" hint="At least 8 characters"><Input type="password" required minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
          <Button type="submit" className="w-full" loading={busy}>Create account</Button>
        </form>
      </CardBody>
      <div className="border-t px-5 py-3.5 text-center text-[13px] text-muted-foreground">
        Already have an account? <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</Link>
      </div>
    </Card>
  );
}
