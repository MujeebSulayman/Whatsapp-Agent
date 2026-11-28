'use client';
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, Sparkles, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { mutate } from 'swr';
import { Button, Card, CardBody, CardHeader, ErrorNote, Textarea, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { photoToDataUrl } from '@/lib/image';
import type { ImportProposal } from '@/lib/types';
import { useLabels } from '@/lib/use-labels';
import { useMoney } from '@/lib/use-money';
import { cn } from '@/lib/utils';

interface PRow { id: string; on: boolean; name: string; description: string; price: string; stock: string; variants: string; flagged: boolean }
interface ZRow { id: string; on: boolean; area: string; fee: string; eta: string; flagged: boolean }
interface FRow { id: string; on: boolean; question: string; answer: string }
interface Counts { productsAdded: number; productsUpdated: number; zones: number; faqs: number }

const cell = 'h-9 w-full rounded-md border bg-card px-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
let n = 0;
const uid = () => `r${++n}`;

export function ImportPanel() {
  const money = useMoney();
  const labels = useLabels();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<{ id: string; url: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [review, setReview] = useState<{ p: PRow[]; z: ZRow[]; f: FRow[]; warnings: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Counts | null>(null);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setErr(null);
    try {
      const room = 4 - photos.length;
      const added = await Promise.all([...files].slice(0, room).map(async (f) => ({ id: uid(), name: f.name, url: await photoToDataUrl(f) })));
      setPhotos((p) => [...p, ...added]);
      if (files.length > room) setErr('You can add up to 4 photos at a time.');
    } catch (e) { setErr((e as Error).message); }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function analyze() {
    setBusy(true); setErr(null); setDone(null);
    try {
      const r = await api.post<ImportProposal>('setup-ai/import', { text: text.trim() || undefined, images: photos.map((p) => p.url) });
      setReview({
        p: r.products.map((x) => ({ id: uid(), on: true, name: x.name, description: x.description ?? '', price: x.priceMinor === null ? '' : money.toInput(x.priceMinor), stock: x.stockQty === null ? '' : String(x.stockQty), variants: x.variants.join(', '), flagged: x.priceMinor === null })),
        z: r.zones.map((x) => ({ id: uid(), on: true, area: x.areaName, fee: x.feeMinor === null ? '' : money.toInput(x.feeMinor), eta: x.etaText ?? '', flagged: x.feeMinor === null })),
        f: r.faqs.map((x) => ({ id: uid(), on: true, question: x.question, answer: x.answer })),
        warnings: r.warnings
      });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const upP = (id: string, patch: Partial<PRow>) => setReview((r) => r && { ...r, p: r.p.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const upZ = (id: string, patch: Partial<ZRow>) => setReview((r) => r && { ...r, z: r.z.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const upF = (id: string, patch: Partial<FRow>) => setReview((r) => r && { ...r, f: r.f.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  const pBad = (x: PRow) => x.on && (x.name.trim().length < 1 || money.parse(x.price) === null || (labels.showStock && x.stock.trim() !== '' && !/^\d+$/.test(x.stock.trim())));
  const zBad = (x: ZRow) => x.on && (x.area.trim().length < 2 || money.parse(x.fee) === null);
  const fBad = (x: FRow) => x.on && (x.question.trim().length < 3 || x.answer.trim().length < 1);
  const selected = review ? review.p.filter((x) => x.on).length + review.z.filter((x) => x.on).length + review.f.filter((x) => x.on).length : 0;
  const invalid = review ? review.p.some(pBad) || review.z.some(zBad) || review.f.some(fBad) : false;

  async function save() {
    if (!review) return;
    setSaving(true); setErr(null);
    try {
      const counts = await api.post<Counts>('setup-ai/apply', {
        products: review.p.filter((x) => x.on).map((x) => ({
          name: x.name.trim(), description: x.description.trim() || null, priceMinor: money.parse(x.price)!,
          // Only send a stock number the owner typed. Blank means "I don't count this": always available.
          ...(labels.showStock && x.stock.trim() ? { stockQty: Number(x.stock) } : {}), variants: x.variants.split(',').map((v) => v.trim()).filter(Boolean)
        })),
        zones: review.z.filter((x) => x.on).map((x) => ({ areaName: x.area.trim(), feeMinor: money.parse(x.fee)!, etaText: x.eta.trim() || 'ask us' })),
        faqs: review.f.filter((x) => x.on).map((x) => ({ question: x.question.trim(), answer: x.answer.trim() }))
      });
      await Promise.all(['products', 'delivery-zones', 'faqs', 'business'].map((k) => mutate(k)));
      setDone(counts); setReview(null); setText(''); setPhotos([]);
      toast('Saved to your setup');
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  if (done) {
    return (
      <Card><CardBody className="flex flex-col items-center gap-3 py-12 text-center">
        <CheckCircle2 className="size-9 text-success" />
        <div className="text-base font-semibold">Saved</div>
        <p className="max-w-md text-[13px] text-muted-foreground">
          {[done.productsAdded && `${done.productsAdded} new ${labels.items.toLowerCase()}`, done.productsUpdated && `${done.productsUpdated} updated`, done.zones && `${done.zones} ${labels.zones.toLowerCase()}`, done.faqs && `${done.faqs} FAQs`].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-2 flex gap-2">
          <Link href="/products"><Button>See your {labels.items.toLowerCase()}<ArrowRight className="size-4" /></Button></Link>
          <Button variant="secondary" onClick={() => setDone(null)}>Add more</Button>
        </div>
      </CardBody></Card>
    );
  }

  return (
    <div className="space-y-6">
      {!review && (
        <Card>
          <CardHeader title="Paste it or photograph it" description={`A price list, a menu, a WhatsApp Status, or just type it the way you would tell a friend. We read it and you review everything before anything is saved. Prices are in ${money.currency}.`} />
          <CardBody className="space-y-4">
            <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000}
              placeholder={labels.kind === 'services' ? 'e.g.\nAC servicing from 25,000\nGas refill 18,000\nCall-out fee: Lekki 3,000, Ajah 4,500' : 'e.g.\nParty pack 12k\nPuff puff (box of 30) 2,500\nSamosa: beef or chicken 3,000\nDelivery: Lekki 2k, Ikoyi 3,500'} />
            <div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void addPhotos(e.target.files)} />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" disabled={photos.length >= 4} onClick={() => fileRef.current?.click()}><Camera className="size-4" />Add photos</Button>
                <span className="text-[13px] text-muted-foreground">Up to 4 photos of a menu or price list. They are shrunk on your device first.</span>
              </div>
              {photos.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-3">
                  {photos.map((p) => (
                    <li key={p.id} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.name} className="size-20 rounded-lg border object-cover" />
                      <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPhotos((x) => x.filter((y) => y.id !== p.id))} className="absolute -right-2 -top-2 rounded-full border bg-card p-1 shadow"><X className="size-3" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {err && <ErrorNote>{err}</ErrorNote>}
            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">Your text and photos are sent to our AI provider to be read, and are not kept by us.</p>
              <Button onClick={analyze} loading={busy} disabled={!text.trim() && photos.length === 0}><Sparkles className="size-4" />{busy ? 'Reading…' : 'Read it'}</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {review && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold">Check what we found</h2><p className="text-[13px] text-muted-foreground">Fix anything that is wrong, untick what you don&apos;t want. Nothing is saved until you press Save.</p></div>
            <Button variant="ghost" onClick={() => setReview(null)}>Start over</Button>
          </div>
          {review.warnings.length > 0 && (
            <div className="space-y-1 rounded-lg border border-warning/30 bg-warning-bg p-3 text-[13px] text-warning">
              {review.warnings.map((w, i) => <div key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{w}</div>)}
            </div>
          )}
          {review.p.length === 0 && review.z.length === 0 && review.f.length === 0 && <ErrorNote>We couldn&apos;t find anything to add. Try a clearer photo, or type the items out.</ErrorNote>}

          {review.p.length > 0 && (
            <Card>
              <CardHeader title={`${labels.items} (${review.p.filter((x) => x.on).length} of ${review.p.length})`} description={labels.kind === 'services' ? 'Starting prices. Items with the same name as an existing one update it.' : 'Items with the same name as an existing one update it.'} />
              <div className="divide-y">
                {review.p.map((x) => (
                  <div key={x.id} className={cn('grid items-start gap-2 p-3 sm:grid-cols-[auto_1.4fr_1fr_0.7fr_1.2fr_auto]', !x.on && 'opacity-50')}>
                    <input type="checkbox" checked={x.on} onChange={(e) => upP(x.id, { on: e.target.checked })} aria-label={`Include ${x.name}`} className="mt-2.5 size-4" />
                    <div className="space-y-1.5"><input className={cell} value={x.name} onChange={(e) => upP(x.id, { name: e.target.value })} aria-label="Name" /><input className={cn(cell, 'text-muted-foreground')} value={x.description} onChange={(e) => upP(x.id, { description: e.target.value })} placeholder="Description (optional)" aria-label="Description" /></div>
                    <div><input className={cn(cell, x.on && money.parse(x.price) === null && 'border-danger')} inputMode="decimal" value={x.price} onChange={(e) => upP(x.id, { price: e.target.value, flagged: false })} placeholder={`Price (${money.currency})`} aria-label="Price" />{x.flagged && <div className="mt-1 text-[11px] text-warning">Check the price</div>}</div>
                    {labels.showStock ? <input className={cn(cell, x.on && x.stock.trim() && !/^\d+$/.test(x.stock.trim()) && 'border-danger')} inputMode="numeric" value={x.stock} onChange={(e) => upP(x.id, { stock: e.target.value })} placeholder="Not counted" aria-label="Stock (leave blank if you do not count it)" /> : <span />}
                    <input className={cell} value={x.variants} onChange={(e) => upP(x.id, { variants: e.target.value })} placeholder="Options, comma separated" aria-label="Options" />
                    <button type="button" aria-label={`Remove ${x.name}`} onClick={() => setReview((r) => r && { ...r, p: r.p.filter((y) => y.id !== x.id) })} className="mt-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {review.z.length > 0 && (
            <Card>
              <CardHeader title={`${labels.zones} (${review.z.filter((x) => x.on).length} of ${review.z.length})`} />
              <div className="divide-y">
                {review.z.map((x) => (
                  <div key={x.id} className={cn('grid items-start gap-2 p-3 sm:grid-cols-[auto_1.4fr_1fr_1fr_auto]', !x.on && 'opacity-50')}>
                    <input type="checkbox" checked={x.on} onChange={(e) => upZ(x.id, { on: e.target.checked })} aria-label={`Include ${x.area}`} className="mt-2.5 size-4" />
                    <input className={cell} value={x.area} onChange={(e) => upZ(x.id, { area: e.target.value })} aria-label="Area" />
                    <div><input className={cn(cell, x.on && money.parse(x.fee) === null && 'border-danger')} inputMode="decimal" value={x.fee} onChange={(e) => upZ(x.id, { fee: e.target.value, flagged: false })} placeholder={`${labels.fee} (${money.currency})`} aria-label="Fee" />{x.flagged && <div className="mt-1 text-[11px] text-warning">Check the fee</div>}</div>
                    <input className={cell} value={x.eta} onChange={(e) => upZ(x.id, { eta: e.target.value })} placeholder="Time, e.g. 45 min" aria-label="Time" />
                    <button type="button" aria-label={`Remove ${x.area}`} onClick={() => setReview((r) => r && { ...r, z: r.z.filter((y) => y.id !== x.id) })} className="mt-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {review.f.length > 0 && (
            <Card>
              <CardHeader title={`FAQs (${review.f.filter((x) => x.on).length} of ${review.f.length})`} />
              <div className="divide-y">
                {review.f.map((x) => (
                  <div key={x.id} className={cn('flex items-start gap-3 p-3', !x.on && 'opacity-50')}>
                    <input type="checkbox" checked={x.on} onChange={(e) => upF(x.id, { on: e.target.checked })} aria-label="Include FAQ" className="mt-2.5 size-4" />
                    <div className="flex-1 space-y-1.5"><input className={cell} value={x.question} onChange={(e) => upF(x.id, { question: e.target.value })} aria-label="Question" /><textarea className={cn(cell, 'h-16 py-2')} value={x.answer} onChange={(e) => upF(x.id, { answer: e.target.value })} aria-label="Answer" /></div>
                    <button type="button" aria-label="Remove FAQ" onClick={() => setReview((r) => r && { ...r, f: r.f.filter((y) => y.id !== x.id) })} className="mt-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {err && <ErrorNote>{err}</ErrorNote>}
          <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-lg border bg-card/95 p-3 shadow-lg backdrop-blur">
            <span className="text-[13px] text-muted-foreground">{invalid ? 'Fix the highlighted fields to continue.' : `${selected} item${selected === 1 ? '' : 's'} ready to save`}</span>
            <Button onClick={save} loading={saving} disabled={invalid || selected === 0}>Save {selected} item{selected === 1 ? '' : 's'}</Button>
          </div>
        </>
      )}
    </div>
  );
}
