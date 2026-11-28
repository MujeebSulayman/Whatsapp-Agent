'use client';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { mutate } from 'swr';
import { Button, Card, CardHeader, Dialog, EmptyState, ErrorNote, Field, IconButton, Input, Loading, Table, TD, TH, THead, TR, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { Zone } from '@/lib/types';
import { useLabels } from '@/lib/use-labels';
import { useMoney } from '@/lib/use-money';

/** Delivery or service areas with their fees. Used on the Business page and in the setup. */
export function DeliveryZones() {
  const money = useMoney();
  const labels = useLabels();
  const toast = useToast();
  const { data: zones, isLoading } = useApi<Zone[]>('delivery-zones');
  const [target, setTarget] = useState<Zone | 'new' | null>(null);
  const [seed, setSeed] = useState<unknown>(null);
  const [f, setF] = useState({ areaName: '', fee: '', etaText: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const z = target && target !== 'new' ? target : null;
  if (target !== seed) { setSeed(target); setErr(null); setF(z ? { areaName: z.areaName, fee: money.toInput(z.feeMinor), etaText: z.etaText } : { areaName: '', fee: '', etaText: '' }); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const feeMinor = money.parse(f.fee);
    if (feeMinor === null) return setErr(`Enter a valid fee in ${money.currency}, e.g. ${money.example}`);
    setBusy(true); setErr(null);
    try {
      const body = { areaName: f.areaName.trim(), feeMinor, etaText: f.etaText.trim() };
      if (z) await api.patch(`delivery-zones/${z.id}`, body); else await api.post('delivery-zones', body);
      await Promise.all([mutate('delivery-zones'), mutate('business')]); toast('Delivery area saved'); setTarget(null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api.delete(`delivery-zones/${id}`); await Promise.all([mutate('delivery-zones'), mutate('business')]); toast('Delivery area removed'); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title={labels.zones} action={<Button size="sm" onClick={() => setTarget('new')}><Plus className="size-3.5" />Add area</Button>} />
      {isLoading ? <Loading /> : !zones?.length ? <EmptyState icon={<MapPin />} title={`No ${labels.zones.toLowerCase()} yet`} /> : (
        <Table>
          <THead><tr><TH>Area</TH><TH>Delivery time</TH><TH className="text-right">Fee</TH><TH className="w-20"><span className="sr-only">Actions</span></TH></tr></THead>
          <tbody>
            {zones.map((x) => (
              <TR key={x.id}>
                <TD className="font-medium">{x.areaName}</TD><TD className="text-[13px] text-muted-foreground">{x.etaText}</TD><TD className="text-right font-medium tabular-nums">{money.fmt(x.feeMinor)}</TD>
                <TD><div className="flex justify-end gap-0.5"><IconButton label={`Edit ${x.areaName}`} onClick={() => setTarget(x)}><Pencil /></IconButton><IconButton label={`Delete ${x.areaName}`} tone="danger" onClick={() => remove(x.id)}><Trash2 /></IconButton></div></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <Dialog open={!!target} onClose={() => setTarget(null)} title={z ? 'Edit delivery area' : 'Add delivery area'}
        footer={<><Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button><Button type="submit" form="zone-form" loading={busy}>Save</Button></>}>
        <form id="zone-form" onSubmit={submit} className="space-y-4">
          {err && <ErrorNote>{err}</ErrorNote>}
          <Field label="Area"><Input required value={f.areaName} onChange={(e) => setF({ ...f, areaName: e.target.value })} placeholder="e.g. Downtown" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${labels.fee} (${money.currency})`}><Input required inputMode="decimal" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>
            <Field label="Delivery time"><Input required value={f.etaText} onChange={(e) => setF({ ...f, etaText: e.target.value })} placeholder="45–60 minutes" /></Field>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

