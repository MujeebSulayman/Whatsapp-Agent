'use client';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useAiAvailable } from './use-ai';

/** "Improve with AI" for one field. Shows the suggestion; the owner decides whether to use it. */
export function SuggestButton({ field, text, context, onUse }: { field: 'instructions' | 'faq_answer' | 'product_description'; text: string; context?: string; onUse: (v: string) => void }) {
  const { available } = useAiAvailable();
  const [busy, setBusy] = useState(false);
  const [s, setS] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!available) return null;

  async function run() {
    setBusy(true); setErr(null); setS(null);
    try { setS((await api.post<{ suggestion: string }>('setup-ai/improve', { field, text: text.slice(0, 2000), ...(context ? { context: context.slice(0, 300) } : {}) })).suggestion); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mt-1.5">
      <Button type="button" size="sm" variant="ghost" onClick={run} loading={busy} disabled={text.trim().length < 3}><Sparkles className="size-3.5" />Improve with AI</Button>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
      {s && (
        <div className="mt-2 rounded-lg border bg-muted/40 p-3">
          <p className="whitespace-pre-wrap text-[13px]">{s}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={() => { onUse(s); setS(null); }}>Use this</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setS(null)}>Dismiss</Button>
          </div>
        </div>
      )}
    </div>
  );
}
