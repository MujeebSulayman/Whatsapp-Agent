'use client';
import { Download, Package, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { mutate } from 'swr';
import { Badge, Button, Card, Dialog, EmptyState, ErrorNote, Field, Input, Loading, PageHeader, Switch, Table, TD, TH, THead, Textarea, TR, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useLabels } from '@/lib/use-labels';
import { useMoney } from '@/lib/use-money';

const KEY = 'products';
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
      <div className="mb-4"><Input className="max-w-xs" placeholder={`Search ${labels.items.toLowerCase()}`} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Card>
        {isLoading ? <Loading /> : !products?.length ? (
          <EmptyState icon={<Package className="size-5" />} title={`No ${labels.items.toLowerCase()} yet`} description={`Add your first ${labels.item}, or import many at once from a spreadsheet.`}
            action={<div className="flex gap-2"><Button variant="secondary" onClick={() => setImporting(true)}>Import CSV</Button><Button onClick={() => setEditing('new')}>{labels.addItem}</Button></div>} />
        ) : (
          <Table>
            <THead><tr><TH>{labels.kind === 'services' ? 'Service' : 'Name'}</TH><TH>{labels.priceLabel}</TH>{labels.showStock && <TH>Stock</TH>}<TH>Options</TH><TH>Available</TH><TH className="w-24"><span className="sr-only">Actions</span></TH></tr></THead>
            <tbody>
              {list.map((p) => (
                <TR key={p.id}>
                  <TD><div className="font-medium">{p.name}</div>{p.description && <div className="max-w-xs truncate text-xs text-muted-foreground">{p.description}</div>}</TD>
                  <TD className="tabular-nums">{money.fmt(p.priceMinor)}</TD>
                  {labels.showStock && <TD>{!p.trackStock ? <span className="text-muted-foreground">Not tracked</span> : p.stockQty === 0 ? <Badge tone="danger">Out of stock</Badge> : p.stockQty <= 3 ? <Badge tone="warning">{p.stockQty} left</Badge> : <span className="tabular-nums">{p.stockQty}</span>}</TD>}
                  <TD className="text-muted-foreground">{p.variants?.map((v) => v.name).join(', ') || '—'}</TD>
                  <TD><Switch checked={p.active} onChange={(v) => toggle(p, v)} label={`${p.name} available`} /></TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Pencil className="size-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}><Trash2 className="size-4" /></Button>
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
  const [f, setF] = useState({ name: '', description: '', price: '', stock: '', variants: '', image: '' });
  // Services never track stock; mixed businesses choose per item; products always do.
  const [track, setTrack] = useState(true);
  const [seed, setSeed] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (target !== seed) {
    setSeed(target);
    setErr(null);
    setTrack(p ? p.trackStock : labels.kind !== 'services');
    setF(p ? { name: p.name, description: p.description ?? '', price: money.toInput(p.priceMinor), stock: String(p.stockQty), variants: p.variants?.map((v) => v.name).join(', ') ?? '', image: p.imageUrls[0] ?? '' } : { name: '', description: '', price: '', stock: '0', variants: '', image: '' });
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const priceMinor = money.parse(f.price);
    const stockQty = track ? Number(f.stock) : 0;
    if (priceMinor === null) return setErr(`Enter a valid price in ${money.currency}, e.g. ${money.example}`);
    if (track && (!Number.isInteger(stockQty) || stockQty < 0)) return setErr('Stock must be a whole number, 0 or more');
    const variants = f.variants.split(',').map((v) => v.trim()).filter(Boolean).map((name) => ({ name }));
    const body = { name: f.name.trim(), description: f.description.trim() || null, priceMinor, stockQty, trackStock: track, variants: variants.length ? variants : null, imageUrls: f.image.trim() ? [f.image.trim()] : [] };
    setBusy(true); setErr(null);
    try {
      if (p) await api.patch(`products/${p.id}`, body); else await api.post('products', body);
      await mutate(KEY);
      toast(p ? `${labels.item[0]!.toUpperCase()}${labels.item.slice(1)} updated` : `${labels.item[0]!.toUpperCase()}${labels.item.slice(1)} added`);
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={!!target} onClose={onClose} title={p ? `Edit ${labels.item}` : labels.addItem}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="product-form" loading={busy}>{p ? 'Save changes' : labels.addItem}</Button></>}>
      <form id="product-form" onSubmit={submit} className="space-y-4">
        {err && <ErrorNote>{err}</ErrorNote>}
        <Field label="Name"><Input required value={f.name} onChange={set('name')} /></Field>
        <Field label="Description" hint={`Shown to the assistant so it can describe the ${labels.item}.`}><Textarea rows={2} value={f.description} onChange={set('description')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${labels.priceLabel} (${money.currency})`} hint={labels.kind === 'services' ? 'The "from" price. The final price can be confirmed after the job is assessed.' : undefined}><Input required inputMode="decimal" placeholder={money.example} value={f.price} onChange={set('price')} /></Field>
          {track && <Field label="In stock"><Input required inputMode="numeric" value={f.stock} onChange={set('stock')} /></Field>}
        </div>
        {labels.kind === 'both' && (
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} />Track stock for this item <span className="text-muted-foreground">(untick for services or made-to-order items)</span></label>
        )}
        <Field label="Options (optional)" hint="Separate with commas, e.g. Beef, Chicken"><Input value={f.variants} onChange={set('variants')} /></Field>
        <Field label="Photo link (optional)" hint="A public image URL the assistant can send to customers."><Input type="url" placeholder="https://…" value={f.image} onChange={set('image')} /></Field>
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
