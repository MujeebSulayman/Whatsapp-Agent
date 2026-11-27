'use client';
import { Camera, Download, Package, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { mutate } from 'swr';
import { Button, Card, Dialog, EmptyState, ErrorNote, Field, IconButton, Input, Loading, PageHeader, SearchInput, StatusDot, Switch, Table, TD, TH, THead, Textarea, TR, useToast } from '@/components/ui';
import { SuggestButton } from '@/components/setup/suggest-button';
import { api, useApi } from '@/lib/api';
import { mediaSrc, photoToDataUrl } from '@/lib/image';
import type { Product, WaitGroup } from '@/lib/types';
import { useLabels } from '@/lib/use-labels';
import { useMoney } from '@/lib/use-money';

const KEY = 'products';
let optId = 0;
const TEMPLATE = 'name,description,price,stock,variants\nParty Pack,Serves 10,12000,20,\nSamosa Box,20 pieces,3000,40,Beef|Chicken\n';

export default function ProductsPage() {
  const money = useMoney();
  const labels = useLabels();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const { data: products, isLoading } = useApi<Product[]>(KEY);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const list = (products ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  async function toggle(p: Product, active: boolean) {
    await mutate(KEY, (cur?: Product[]) => cur?.map((x) => (x.id === p.id ? { ...x, active } : x)), false);
    try { await api.patch(`products/${p.id}`, { active }); } catch (e) { toast((e as Error).message, 'error'); await mutate(KEY); }
  }
  async function remove() {
    if (!deleting) return;
    try { await api.delete(`products/${deleting.id}`); await mutate(KEY); toast('Product deleted'); setDeleting(null); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <>
      <PageHeader title={labels.items} description={labels.kind === 'services' ? 'The assistant only quotes the services and starting prices you set here.' : 'The assistant only quotes the prices and stock you set here.'}
        actions={<><Button variant="secondary" onClick={() => setImporting(true)}><Upload className="size-4" />Import CSV</Button><Button onClick={() => setEditing('new')}><Plus className="size-4" />{labels.addItem}</Button></>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput className="w-full sm:w-72" placeholder={`Search ${labels.items.toLowerCase()}`} value={search} onChange={(e) => setSearch(e.target.value)} />
        {products && products.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">{products.filter((p) => p.active).length} of {products.length} available</span>}
      </div>
      <WaitlistCard />
      <Card className="overflow-hidden">
        {isLoading ? <Loading /> : !products?.length ? (
          <EmptyState icon={<Package />} title={`No ${labels.items.toLowerCase()} yet`} description={`Add your first ${labels.item}, or import many at once from a spreadsheet.`}
            action={<div className="flex gap-2"><Button variant="secondary" onClick={() => setImporting(true)}>Import CSV</Button><Button onClick={() => setEditing('new')}>{labels.addItem}</Button></div>} />
        ) : (
          <Table>
            <THead><tr><TH>{labels.kind === 'services' ? 'Service' : 'Name'}</TH>{labels.showStock && <TH>Stock</TH>}<TH>Options</TH><TH className="text-right">{labels.priceLabel}</TH><TH>Available</TH><TH className="w-20"><span className="sr-only">Actions</span></TH></tr></THead>
            <tbody>
              {list.map((p) => (
                <TR key={p.id} className="group">
                  <TD>
                    <div className="flex items-center gap-3">
                      {p.imageUrls[0]
                        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={mediaSrc(p.imageUrls[0])} alt="" className="size-9 shrink-0 rounded-lg border object-cover" />
                        : <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground"><Package className="size-4" strokeWidth={1.75} /></span>}
                      <div className="min-w-0"><div className="truncate font-medium">{p.name}</div>{p.description && <div className="max-w-xs truncate text-xs text-muted-foreground">{p.description}</div>}</div>
                    </div>
                  </TD>
                  {labels.showStock && <TD><StockCell p={p} /></TD>}
                  <TD className="text-[13px] text-muted-foreground">{p.variants?.map((v) => v.name).join(', ') || '—'}</TD>
                  <TD className="text-right font-medium tabular-nums">{money.fmt(p.priceMinor)}</TD>
                  <TD><Switch checked={p.active} onChange={(v) => toggle(p, v)} label={`${p.name} available`} /></TD>
                  <TD>
                    <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <IconButton label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Pencil /></IconButton>
                      <IconButton label={`Delete ${p.name}`} tone="danger" onClick={() => setDeleting(p)}><Trash2 /></IconButton>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <ProductDialog target={editing} onClose={() => setEditing(null)} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete product?" description={deleting ? `“${deleting.name}” will be removed. Past orders keep their details.` : undefined}
        footer={<><Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}><span /></Dialog>
    </>
  );
}

function ProductDialog({ target, onClose }: { target: Product | 'new' | null; onClose: () => void }) {
  const money = useMoney();
  const toast = useToast();
  const labels = useLabels();
  const p = target && target !== 'new' ? target : null;
  const [f, setF] = useState({ name: '', description: '', price: '', stock: '', restock: '' });
  // Options (sizes, colours): a name each, and optionally their own stock number.
  const [opts, setOpts] = useState<{ id: number; name: string; qty: string; image: string }[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [perOption, setPerOption] = useState(false);
  const [preorder, setPreorder] = useState(false);
  // Services never track stock; mixed businesses choose per item; products always do.
  const [track, setTrack] = useState(true);
  const [seed, setSeed] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (target !== seed) {
    setSeed(target);
    setErr(null);
    setTrack(p ? p.trackStock : labels.kind !== 'services');
    setF(p ? { name: p.name, description: p.description ?? '', price: money.toInput(p.priceMinor), stock: String(p.stockQty), restock: p.restockNote ?? '' } : { name: '', description: '', price: '', stock: '0', restock: '' });
    setOpts((p?.variants ?? []).map((v) => ({ id: ++optId, name: v.name, qty: typeof v.stockQty === 'number' ? String(v.stockQty) : '', image: v.image ?? '' })));
    setPhotos(p?.imageUrls ?? []);
    setPerOption(!!p?.variants?.length && p.variants.every((v) => typeof v.stockQty === 'number'));
    setPreorder(p?.allowPreorder ?? false);
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  /** Shrink in the browser, then store. Returns the saved path, or null after showing the reason. */
  async function upload(file: File): Promise<string | null> {
    try {
      const data = await photoToDataUrl(file, { maxEdge: 1200, maxChars: 520_000 });
      return (await api.post<{ url: string }>('media', { data })).url;
    } catch (e) { setErr((e as Error).message); return null; }
  }
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setErr(null);
    const room = 8 - photos.length;
    const added: string[] = [];
    for (const f of [...files].slice(0, room)) { const u = await upload(f); if (u) added.push(u); }
    setPhotos((cur) => [...cur, ...added]);
    setUploading(false);
  }
  async function setOptionPhoto(id: number, files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setUploading(true); setErr(null);
    const u = await upload(f);
    if (u) setOpts((cur) => cur.map((x) => (x.id === id ? { ...x, image: u } : x)));
    setUploading(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const priceMinor = money.parse(f.price);
    const named = opts.filter((o) => o.name.trim());
    const split = track && perOption && named.length > 0;
    const stockQty = track && !split ? Number(f.stock) : 0;
    if (priceMinor === null) return setErr(`Enter a valid price in ${money.currency}, e.g. ${money.example}`);
    if (track && !split && (!Number.isInteger(stockQty) || stockQty < 0)) return setErr('Stock must be a whole number, 0 or more');
    const qtys = named.map((o) => Number(o.qty === '' ? NaN : o.qty));
    if (split && qtys.some((q) => !Number.isInteger(q) || q < 0)) return setErr('Give every option a stock number (0 if sold out)');
    if (new Set(named.map((o) => o.name.trim().toLowerCase())).size !== named.length) return setErr('Two options have the same name');
    const variants = named.map((o, i) => ({ name: o.name.trim(), ...(split ? { stockQty: qtys[i]! } : {}), ...(o.image ? { image: o.image } : {}) }));
    const body = { name: f.name.trim(), description: f.description.trim() || null, priceMinor, stockQty, trackStock: track, variants: variants.length ? variants : null, imageUrls: photos, restockNote: track ? f.restock.trim() || null : null, allowPreorder: track && preorder };
    setBusy(true); setErr(null);
    try {
      const saved = p ? await api.patch<Product & { waitingNow?: number }>(`products/${p.id}`, body) : await api.post<Product>('products', body);
      await Promise.all([mutate(KEY), mutate('waitlist')]);
      const waiting = (saved as { waitingNow?: number }).waitingNow ?? 0;
      toast(waiting > 0 ? `Saved. ${waiting} ${waiting === 1 ? 'person is' : 'people are'} waiting for this: message them from the waiting list above.` : p ? `${labels.item[0]!.toUpperCase()}${labels.item.slice(1)} updated` : `${labels.item[0]!.toUpperCase()}${labels.item.slice(1)} added`);
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={!!target} onClose={onClose} title={p ? `Edit ${labels.item}` : labels.addItem}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="product-form" loading={busy} disabled={uploading}>{p ? 'Save changes' : labels.addItem}</Button></>}>
      <form id="product-form" onSubmit={submit} className="space-y-4">
        {err && <ErrorNote>{err}</ErrorNote>}
        <Field label="Name"><Input required value={f.name} onChange={set('name')} /></Field>
        <Field label="Description" hint={`Shown to the assistant so it can describe the ${labels.item}.`}><Textarea rows={2} value={f.description} onChange={set('description')} /><SuggestButton field="product_description" text={f.description || f.name} context={f.name} onUse={(v) => setF({ ...f, description: v })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${labels.priceLabel} (${money.currency})`} hint={labels.kind === 'services' ? 'The "from" price. The final price can be confirmed after the job is assessed.' : undefined}><Input required inputMode="decimal" placeholder={money.example} value={f.price} onChange={set('price')} /></Field>
          {track && !(perOption && opts.some((o) => o.name.trim())) && <Field label="In stock"><Input required inputMode="numeric" value={f.stock} onChange={set('stock')} /></Field>}
        </div>
        {labels.kind === 'both' && (
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} />Track stock for this item <span className="text-muted-foreground">(untick for services or made-to-order items)</span></label>
        )}
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Options (optional)</div>
          <p className="mb-2 text-xs text-muted-foreground">Sizes, colours or flavours. Add one row for each.</p>
          <div className="space-y-2">
            {opts.map((o) => (
              <div key={o.id} className="flex gap-2">
                <Input value={o.name} placeholder="e.g. 42, Red, Beef" aria-label="Option name" onChange={(e) => setOpts(opts.map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x)))} />
                {track && perOption && <Input className="w-28" inputMode="numeric" placeholder="In stock" aria-label={`Stock for ${o.name || 'option'}`} value={o.qty} onChange={(e) => setOpts(opts.map((x) => (x.id === o.id ? { ...x, qty: e.target.value } : x)))} />}
                <label title={o.image ? 'Change photo of this option' : 'Add a photo of this option'} className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-muted/40 text-muted-foreground hover:text-foreground">
                  {o.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={mediaSrc(o.image)} alt="" className="size-full object-cover" /> : <Camera className="size-4" strokeWidth={1.75} />}
                  <input type="file" accept="image/*" className="sr-only" aria-label={`Photo of ${o.name || 'option'}`} onChange={(e) => { void setOptionPhoto(o.id, e.target.files); e.target.value = ''; }} />
                </label>
                <IconButton type="button" label="Remove option" onClick={() => setOpts(opts.filter((x) => x.id !== o.id))}><Trash2 /></IconButton>
              </div>
            ))}
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpts([...opts, { id: ++optId, name: '', qty: perOption ? '0' : '', image: '' }])}><Plus className="size-3.5" />Add option</Button>
          </div>
          {track && opts.length > 0 && (
            <label className="mt-3 flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5" checked={perOption} onChange={(e) => { setPerOption(e.target.checked); if (e.target.checked) setOpts(opts.map((o) => ({ ...o, qty: o.qty || '0' }))); }} />
              <span>Count stock separately for each option<span className="block text-muted-foreground">Recommended for sizes and colours, so the assistant knows which one is sold out.</span></span></label>
          )}
        </div>
        {track && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="text-[13px] font-medium">When it is sold out</div>
            <Field label="Note for customers (optional)" hint="Shown only when sold out, e.g. “Back around 20 Dec”. The assistant never makes up a restock date."><Input maxLength={120} value={f.restock} onChange={set('restock')} /></Field>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={preorder} onChange={(e) => setPreorder(e.target.checked)} />Let customers pre-order it <span className="text-muted-foreground">(you confirm each one)</span></label>
          </div>
        )}
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Photos (optional)</div>
          <p className="mb-2 text-xs text-muted-foreground">The assistant sends these when a customer asks to see it. The first one is the main photo. Up to 8.</p>
          <div className="flex flex-wrap gap-2">
            {photos.map((u, i) => (
              <div key={u} className="relative size-20 overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaSrc(u)} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos(photos.filter((x) => x !== u))} className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"><X className="size-3" /></button>
                {i === 0 && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] text-white">Main</span>}
              </div>
            ))}
            {photos.length < 8 && (
              <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground">
                {uploading ? 'Adding…' : <><Camera className="size-4" strokeWidth={1.75} />Add</>}
                <input type="file" accept="image/*" multiple className="sr-only" aria-label="Add photos" disabled={uploading} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const money = useMoney();
  const toast = useToast();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(null);
  const reset = () => { setCsv(''); setFileName(''); setErr(null); setResult(null); };

  async function run() {
    setBusy(true); setErr(null);
    try { setResult(await api.post('products/import', { csv })); await mutate(KEY); toast('Import finished'); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} title="Import products from CSV" description="Existing products with the same name are updated."
      footer={result ? <Button onClick={() => { reset(); onClose(); }}>Done</Button> : <><Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button><Button onClick={run} loading={busy} disabled={!csv}>Import</Button></>}>
      <div className="space-y-4">
        {err && <ErrorNote>{err}</ErrorNote>}
        {result ? (
          <div className="space-y-3 text-sm">
            <p><strong>{result.created}</strong> added, <strong>{result.updated}</strong> updated{result.errors.length > 0 && <>, <strong>{result.errors.length}</strong> skipped</>}.</p>
            {result.errors.length > 0 && <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-muted p-3 text-[13px]">{result.errors.map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}</ul>}
          </div>
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground">Columns: <code>name</code>, <code>description</code>, <code>price</code> (in {money.currency}, use . for decimals), <code>stock</code>, <code>variants</code> (separate with |).</p>
            <a className="inline-flex items-center gap-1.5 text-[13px] font-medium underline-offset-4 hover:underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="products-template.csv"><Download className="size-3.5" />Download template</a>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-8 text-center hover:bg-muted/50">
              <Upload className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">{fileName || 'Choose a .csv file'}</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); setCsv(await f.text()); } }} />
            </label>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Stock for the list: one number, or a short summary when it is held per size/colour. */
function StockCell({ p }: { p: Product }) {
  if (!p.trackStock) return <span className="text-[13px] text-muted-foreground">Not tracked</span>;
  const per = !!p.variants?.length && p.variants.every((v) => typeof v.stockQty === 'number');
  if (per) {
    const out = p.variants!.filter((v) => v.stockQty === 0);
    if (p.stockQty === 0) return <StatusDot tone="danger">Out of stock</StatusDot>;
    return <div><span className="tabular-nums">{p.stockQty}</span>{out.length > 0 && <div className="text-xs text-warning">Sold out: {out.map((v) => v.name).join(', ')}</div>}</div>;
  }
  return p.stockQty === 0 ? <StatusDot tone="danger">Out of stock</StatusDot> : p.stockQty <= 3 ? <StatusDot tone="warning">{p.stockQty} left</StatusDot> : <span className="tabular-nums">{p.stockQty}</span>;
}

/** People who asked to be told when a sold-out item is back. Shows demand, and lets the owner message them once it is. */
function WaitlistCard() {
  const toast = useToast();
  const { data } = useApi<WaitGroup[]>('waitlist');
  const [busy, setBusy] = useState<string | null>(null);
  if (!data?.length) return null;
  const total = data.reduce((s, g) => s + g.people.length, 0);

  async function notify(g: WaitGroup) {
    setBusy(`${g.productId}${g.variant}`);
    try {
      const r = await api.post<{ notified: number; outsideWindow: number }>('waitlist/notify', { productId: g.productId, variant: g.variant });
      toast(`${r.notified} told${r.outsideWindow ? `. ${r.outsideWindow} can't be messaged yet (more than 24 hours since they wrote)` : ''}`);
      await mutate('waitlist');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }
  async function drop(id: string) {
    try { await api.delete(`waitlist/${id}`); await mutate('waitlist'); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="border-b px-5 py-3"><div className="text-sm font-medium">Waiting for stock</div><p className="text-[13px] text-muted-foreground">{total} {total === 1 ? 'customer is' : 'customers are'} waiting. This shows what to restock first.</p></div>
      <div className="divide-y">
        {data.map((g) => (
          <div key={`${g.productId}${g.variant}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{g.name}{g.variant ? ` (${g.variant})` : ''}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {g.people.slice(0, 4).map((x) => (
                  <span key={x.id} className="inline-flex items-center gap-1">{x.name ?? `+${x.waId}`}<button type="button" aria-label="Remove from list" onClick={() => drop(x.id)} className="rounded px-0.5 hover:text-foreground">×</button></span>
                ))}
                {g.people.length > 4 && <span>+{g.people.length - 4} more</span>}
              </div>
            </div>
            <span className="text-[13px] tabular-nums text-muted-foreground">{g.people.length} waiting</span>
            {g.inStock ? <Button size="sm" onClick={() => notify(g)} loading={busy === `${g.productId}${g.variant}`}>Tell them it is back</Button> : <span className="text-xs text-muted-foreground">Still sold out</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}
