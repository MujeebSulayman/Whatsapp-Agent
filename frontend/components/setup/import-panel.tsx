'use client';
import { AlertTriangle, ArrowRight, Check, ImagePlus, Sparkles, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { mutate } from 'swr';
import { Button, Card, CardBody, CardHeader, Checkbox, ErrorNote, IconButton, Input, Notice, Skeleton, Textarea, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { photoToDataUrl } from '@/lib/image';
import type { BusinessDetail, ImportProposal } from '@/lib/types';
import { useLabels } from '@/lib/use-labels';
import { useMoney } from '@/lib/use-money';
import { cn } from '@/lib/utils';

interface PRow { id: string; check: boolean; on: boolean; name: string; description: string; price: string; stock: string; variants: string; flagged: boolean }
interface ZRow { id: string; check: boolean; on: boolean; area: string; fee: string; eta: string; flagged: boolean }
interface FRow { id: string; on: boolean; question: string; answer: string }
interface Counts { productsAdded: number; productsUpdated: number; zones: number; faqs: number }

const cell = 'h-8 text-[13px]';
const bad = 'border-danger/70';
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
  const [review, setReview] = useState<{ p: PRow[]; z: ZRow[]; f: FRow[]; warnings: string[]; detected: { businessName: string | null; phone: string | null } } | null>(null);
  const [showAll, setShowAll] = useState({ p: false, z: false });
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Counts | null>(null);
  const [dragging, setDragging] = useState(false);

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
        p: r.products.map((x) => ({ id: uid(), check: x.priceMinor === null, on: true, name: x.name, description: x.description ?? '', price: x.priceMinor === null ? '' : money.toInput(x.priceMinor), stock: x.stockQty === null ? '' : String(x.stockQty), variants: x.variants.join(', '), flagged: x.priceMinor === null })),
        z: r.zones.map((x) => ({ id: uid(), check: x.feeMinor === null, on: true, area: x.areaName, fee: x.feeMinor === null ? '' : money.toInput(x.feeMinor), eta: x.etaText ?? '', flagged: x.feeMinor === null })),
        f: r.faqs.map((x) => ({ id: uid(), on: true, question: x.question, answer: x.answer })),
        warnings: r.warnings,
        detected: r.detected ?? { businessName: null, phone: null }
      });
      setShowAll({ p: false, z: false });
      setDismissed([]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function useDetected(kind: 'name' | 'phone', value: string) {
    try {
      if (kind === 'name') await api.patch('business', { name: value }); else await api.put('business/setup', { ownerPhone: value });
      await mutate('business'); setDismissed((d) => [...d, kind]); toast(kind === 'name' ? 'Business name updated' : 'Alert number saved');
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  const upP = (id: string, patch: Partial<PRow>) => setReview((r) => r && { ...r, p: r.p.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const upZ = (id: string, patch: Partial<ZRow>) => setReview((r) => r && { ...r, z: r.z.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const upF = (id: string, patch: Partial<FRow>) => setReview((r) => r && { ...r, f: r.f.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  const pBad = (x: PRow) => x.on && (x.name.trim().length < 1 || money.parse(x.price) === null || (labels.showStock && x.stock.trim() !== '' && !/^\d+$/.test(x.stock.trim())));
  const zBad = (x: ZRow) => x.on && (x.area.trim().length < 2 || money.parse(x.fee) === null);
  const fBad = (x: FRow) => x.on && (x.question.trim().length < 3 || x.answer.trim().length < 1);
  const { data: bizInfo } = useApi<BusinessDetail>('business');
  const bizName = bizInfo?.name ?? 'your business';
  const toCheck = review ? review.p.filter((x) => x.check).length + review.z.filter((x) => x.check).length : 0;
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
    const parts = [
      done.productsAdded > 0 && { n: done.productsAdded, l: `new ${labels.items.toLowerCase()}` },
      done.productsUpdated > 0 && { n: done.productsUpdated, l: 'updated' },
      done.zones > 0 && { n: done.zones, l: labels.zones.toLowerCase() },
      done.faqs > 0 && { n: done.faqs, l: 'FAQs' }
    ].filter(Boolean) as { n: number; l: string }[];
    return (
      <Card><CardBody className="flex flex-col items-center py-12 text-center">
        <span className="animate-pop flex size-12 items-center justify-center rounded-full border border-brand/30 bg-brand/15 text-brand"><Check className="size-6" strokeWidth={2.5} /></span>
        <div className="mt-4 text-base font-semibold tracking-tight">Saved to your setup</div>
        <div className="stagger mt-4 flex flex-wrap justify-center gap-2">
          {parts.map((x) => <span key={x.l} className="rounded-lg border bg-muted/40 px-3 py-1.5 text-[13px]"><span className="font-semibold tabular-nums">{x.n}</span> <span className="text-muted-foreground">{x.l}</span></span>)}
        </div>
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" onClick={() => setDone(null)}>Add more</Button>
          <Link href="/products"><Button>See your {labels.items.toLowerCase()}<ArrowRight className="size-4" /></Button></Link>
        </div>
      </CardBody></Card>
    );
  }

  return (
    <div className="space-y-6">
      {!review && busy && (
        <Card><CardBody className="space-y-3 py-6">
          <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 animate-pulse text-brand" />Reading…</div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.18 }}>
              <Skeleton className="size-4" /><Skeleton className="h-8 flex-[1.4]" /><Skeleton className="h-8 flex-1" /><Skeleton className="h-8 flex-[0.7]" />
            </div>
          ))}
        </CardBody></Card>
      )}
      {!review && !busy && (
        /* One box: type or paste, or drop photos anywhere on it */
        <Card onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void addPhotos(e.dataTransfer.files); }}
          className={cn('overflow-hidden transition-[border-color,box-shadow] duration-150 focus-within:border-brand/60 focus-within:ring-[3px] focus-within:ring-brand/15', dragging && 'border-brand/60 ring-[3px] ring-brand/15')}>
          <textarea rows={11} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} aria-label="Your prices or menu"
            className="block w-full resize-none bg-transparent px-5 pt-5 pb-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
            placeholder={'Paste your prices, or drop a photo\n\n' + (labels.kind === 'services' ? 'AC servicing from 25,000\nGas refill 18,000\nCall-out fee: Ikeja 3,000, Yaba 4,500' : 'Air Runner sneaker 45k (sizes 42-44)\nAnkara dress 18,000\nPhone case 3,500\nDelivery: Ikeja 3k, Yaba 3,500')} />
          <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void addPhotos(e.target.files)} />
          {photos.length > 0 && (
            <ul className="stagger flex flex-wrap gap-3 px-5 pb-4">
              {photos.map((p) => (
                <li key={p.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.name} className="size-16 rounded-lg border object-cover" />
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPhotos((x) => x.filter((y) => y.id !== p.id))}
                    className="absolute -right-2 -top-2 rounded-full border bg-card p-1 text-muted-foreground shadow transition-colors hover:text-foreground"><X className="size-3" /></button>
                </li>
              ))}
            </ul>
          )}
          {err && <div className="px-5 pb-4"><ErrorNote>{err}</ErrorNote></div>}
          <div className="flex items-center justify-between gap-3 border-t px-3 py-2.5">
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={photos.length >= 4}>
              <ImagePlus className="size-4" />{dragging ? 'Drop it' : 'Photo'}{photos.length > 0 && <span className="text-muted-foreground tabular-nums">{photos.length}/4</span>}
            </Button>
            <Button onClick={analyze} disabled={!text.trim() && photos.length === 0}><Sparkles className="size-4" />Read it</Button>
          </div>
        </Card>
      )}

      {review && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Check and save</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setReview(null)}>Start over</Button>
          </div>
          <Card><CardBody className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
            <span><span className="font-medium">{review.p.length}</span> {labels.items.toLowerCase()} found</span>
            {review.z.length > 0 && <span><span className="font-medium">{review.z.length}</span> {labels.zones.toLowerCase()}</span>}
            {review.f.length > 0 && <span><span className="font-medium">{review.f.length}</span> FAQ{review.f.length === 1 ? '' : 's'}</span>}
            {toCheck > 0 ? <span className="text-warning">{toCheck} to check</span> : <span className="text-muted-foreground">Nothing needs checking</span>}
          </CardBody></Card>
          {review.detected.businessName && !dismissed.includes('name') && (
            <Notice tone="warning" icon={<AlertTriangle />} title={`This looks like "${review.detected.businessName}", not "${bizName}"`}>
              <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => useDetected('name', review.detected.businessName!)}>Rename business</Button><Button size="sm" variant="ghost" onClick={() => setDismissed((d) => [...d, 'name'])}>Keep {bizName}</Button></div>
            </Notice>
          )}
          {review.detected.phone && !dismissed.includes('phone') && (
            <Notice title={`Booking number found: ${review.detected.phone}`}>
              <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => useDetected('phone', review.detected.phone!)}>Use it for my alerts</Button><Button size="sm" variant="ghost" onClick={() => setDismissed((d) => [...d, 'phone'])}>No thanks</Button></div>
            </Notice>
          )}
          {review.warnings.length > 0 && (
            <Notice tone="warning" icon={<AlertTriangle />} title="Check these">
              <ul className="space-y-0.5">{review.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </Notice>
          )}
          {labels.showStock && review.p.length > 0 && <p className="text-[13px] text-muted-foreground">Leave <span className="font-medium text-foreground">Stock</span> blank for anything you make to order, or don&apos;t count. It will always be available and never show as sold out.</p>}
          {review.p.length === 0 && review.z.length === 0 && review.f.length === 0 && <ErrorNote>We couldn&apos;t find anything to add. Try a clearer photo, or type the items out.</ErrorNote>}

          {review.p.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title={`${labels.items} · ${review.p.filter((x) => x.on).length} of ${review.p.length}`} description={review.p.some((x) => x.check) ? undefined : 'All prices were read clearly.'} action={review.p.some((x) => !x.check) ? <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => ({ ...v, p: !v.p }))}>{showAll.p ? 'Show only those to check' : `Show all ${review.p.length}`}</Button> : undefined} />
              <div className="stagger divide-y divide-border/60 border-t">
                {review.p.filter((x) => x.check || showAll.p).map((x) => (
                  <div key={x.id} className={cn('grid items-start gap-2 px-4 py-3 transition-opacity sm:grid-cols-[auto_1.4fr_1fr_0.7fr_1.2fr_auto]', !x.on && 'opacity-45')}>
                    <Checkbox checked={x.on} onChange={(e) => upP(x.id, { on: e.target.checked })} aria-label={`Include ${x.name}`} className="mt-2" />
                    <div className="space-y-1.5"><Input className={cell} value={x.name} onChange={(e) => upP(x.id, { name: e.target.value })} aria-label="Name" /><Input className={cn(cell, 'text-muted-foreground')} value={x.description} onChange={(e) => upP(x.id, { description: e.target.value })} placeholder="Description (optional)" aria-label="Description" /></div>
                    <div><Input className={cn(cell, 'tabular-nums', x.on && money.parse(x.price) === null && bad)} inputMode="decimal" value={x.price} onChange={(e) => upP(x.id, { price: e.target.value, flagged: false })} placeholder={`Price (${money.currency})`} aria-label="Price" />{x.flagged && <div className="mt-1 flex items-center gap-1 text-[11px] text-warning"><AlertTriangle className="size-3" />Check</div>}</div>
                    {labels.showStock ? <Input className={cn(cell, 'tabular-nums', x.on && x.stock.trim() && !/^\d+$/.test(x.stock.trim()) && bad)} inputMode="numeric" value={x.stock} onChange={(e) => upP(x.id, { stock: e.target.value })} placeholder="Not counted" aria-label="Stock (leave blank if you do not count it)" /> : <span />}
                    <Input className={cell} value={x.variants} onChange={(e) => upP(x.id, { variants: e.target.value })} placeholder="Options" aria-label="Options" />
                    <IconButton label={`Remove ${x.name}`} tone="danger" onClick={() => setReview((r) => r && { ...r, p: r.p.filter((y) => y.id !== x.id) })}><Trash2 /></IconButton>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {review.z.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title={`${labels.zones} · ${review.z.filter((x) => x.on).length} of ${review.z.length}`} action={review.z.some((x) => !x.check) ? <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => ({ ...v, z: !v.z }))}>{showAll.z ? 'Show only those to check' : `Show all ${review.z.length}`}</Button> : undefined} />
              <div className="stagger divide-y divide-border/60 border-t">
                {review.z.filter((x) => x.check || showAll.z).map((x) => (
                  <div key={x.id} className={cn('grid items-start gap-2 px-4 py-3 transition-opacity sm:grid-cols-[auto_1.4fr_1fr_1fr_auto]', !x.on && 'opacity-45')}>
                    <Checkbox checked={x.on} onChange={(e) => upZ(x.id, { on: e.target.checked })} aria-label={`Include ${x.area}`} className="mt-2" />
                    <Input className={cell} value={x.area} onChange={(e) => upZ(x.id, { area: e.target.value })} aria-label="Area" />
                    <div><Input className={cn(cell, 'tabular-nums', x.on && money.parse(x.fee) === null && bad)} inputMode="decimal" value={x.fee} onChange={(e) => upZ(x.id, { fee: e.target.value, flagged: false })} placeholder={`${labels.fee} (${money.currency})`} aria-label="Fee" />{x.flagged && <div className="mt-1 flex items-center gap-1 text-[11px] text-warning"><AlertTriangle className="size-3" />Check</div>}</div>
                    <Input className={cell} value={x.eta} onChange={(e) => upZ(x.id, { eta: e.target.value })} placeholder="Time" aria-label="Time" />
                    <IconButton label={`Remove ${x.area}`} tone="danger" onClick={() => setReview((r) => r && { ...r, z: r.z.filter((y) => y.id !== x.id) })}><Trash2 /></IconButton>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {review.f.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title={`FAQs · ${review.f.filter((x) => x.on).length} of ${review.f.length}`} />
              <div className="stagger divide-y divide-border/60 border-t">
                {review.f.map((x) => (
                  <div key={x.id} className={cn('flex items-start gap-3 px-4 py-3 transition-opacity', !x.on && 'opacity-45')}>
                    <Checkbox checked={x.on} onChange={(e) => upF(x.id, { on: e.target.checked })} aria-label="Include FAQ" className="mt-2" />
                    <div className="flex-1 space-y-1.5"><Input className={cn(cell, 'font-medium')} value={x.question} onChange={(e) => upF(x.id, { question: e.target.value })} aria-label="Question" /><Textarea rows={2} className="min-h-16 text-[13px]" value={x.answer} onChange={(e) => upF(x.id, { answer: e.target.value })} aria-label="Answer" /></div>
                    <IconButton label="Remove FAQ" tone="danger" onClick={() => setReview((r) => r && { ...r, f: r.f.filter((y) => y.id !== x.id) })}><Trash2 /></IconButton>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {err && <ErrorNote>{err}</ErrorNote>}
          <div className="animate-toast-in sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border bg-card/90 py-2.5 pl-4 pr-2.5 shadow-2xl backdrop-blur-md">
            <span className={cn('flex items-center gap-2 text-[13px]', invalid ? 'text-danger' : 'text-muted-foreground')}>
              <span className={cn('size-1.5 rounded-full', invalid ? 'bg-danger' : 'bg-brand')} />
              {invalid ? 'Fix the red fields' : `${selected} ready`}
            </span>
            <Button onClick={save} loading={saving} disabled={invalid || selected === 0}>Save {selected} item{selected === 1 ? '' : 's'}</Button>
          </div>
        </>
      )}
    </div>
  );
}
