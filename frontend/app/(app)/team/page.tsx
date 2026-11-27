'use client';
import { Plus, Trash2, UsersRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { mutate } from 'swr';
import { Avatar, Badge, Button, Card, Dialog, EmptyState, ErrorNote, Field, IconButton, Input, Loading, PageHeader, Table, TD, TH, THead, TR, useToast } from '@/components/ui';
import { api, useApi, useMe } from '@/lib/api';
import type { TeamMember } from '@/lib/types';

export default function TeamPage() {
  const toast = useToast();
  const { data: team, isLoading } = useApi<TeamMember[]>('team');
  const { data: me } = useMe();
  const owner = me?.role === 'owner';
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.post('team', f); await mutate('team'); toast('Team member added'); setAdding(false); setF({ name: '', email: '', password: '' }); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!removing) return;
    try { await api.delete(`team/${removing.userId}`); await mutate('team'); toast('Team member removed'); setRemoving(null); } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <>
      <PageHeader title="Team" description="People who can read chats and reply from your inbox." actions={owner && <Button onClick={() => setAdding(true)}><Plus className="size-4" />Add team member</Button>} />
      <Card className="overflow-hidden">
        {isLoading ? <Loading /> : !team?.length ? <EmptyState icon={<UsersRound />} title="No team members" /> : (
          <Table>
            <THead><tr><TH>Member</TH><TH>Role</TH><TH className="w-16"><span className="sr-only">Actions</span></TH></tr></THead>
            <tbody>
              {team.map((m) => (
                <TR key={m.userId}>
                  <TD><div className="flex items-center gap-3"><Avatar name={m.name ?? m.email} className="size-8" /><div><div className="font-medium">{m.name ?? '—'}{m.userId === me?.user.id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}</div><div className="text-xs text-muted-foreground">{m.email}</div></div></div></TD>
                  <TD>{m.role === 'owner' ? <Badge>Owner</Badge> : <span className="text-[13px] text-muted-foreground">Agent</span>}</TD>
                  <TD><div className="flex justify-end">{owner && m.role !== 'owner' && <IconButton label={`Remove ${m.email}`} tone="danger" onClick={() => setRemoving(m)}><Trash2 /></IconButton>}</div></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        <div className="border-t bg-muted/20 px-5 py-3 text-[13px] text-muted-foreground">Agents can reply to chats, manage orders and products. Only the owner can change settings, the team and the WhatsApp connection.</div>
      </Card>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add team member" description="They sign in with this email and password. Ask them to keep it private."
        footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" form="team-form" loading={busy}>Add member</Button></>}>
        <form id="team-form" onSubmit={add} className="space-y-4">
          {err && <ErrorNote>{err}</ErrorNote>}
          <Field label="Name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Temporary password" hint="At least 8 characters"><Input type="text" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        </form>
      </Dialog>
      <Dialog open={!!removing} onClose={() => setRemoving(null)} title="Remove team member?" description={removing ? `${removing.email} will lose access immediately.` : undefined}
        footer={<><Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Remove</Button></>}><span /></Dialog>
    </>
  );
}
