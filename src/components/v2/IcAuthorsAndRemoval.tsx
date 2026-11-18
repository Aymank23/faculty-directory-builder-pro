// AKSOB Co-Authors panel + Remove action, shared by the faculty dashboard and My Repository.
// Counts are always derived from confirmed ic_authors links — never a typed number.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Trash2, Users } from 'lucide-react';
import { requestIcRemoval, searchAksobFaculty, suggestCoauthor, friendlyWriteError } from '@/lib/canonicalWrite';

type Row = { link_id: string; faculty_id: string; full_name: string; department: string | null; discipline: string | null; link_status: string; review_note: string | null };

export function CoAuthorsDialog({ ic, facultyId, open, onClose }: { ic: any; facultyId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: rows = [], refetch } = useQuery({
    queryKey: ['ic-author-dir', ic?.id], enabled: open && !!ic,
    queryFn: async () => ((await supabase.rpc('ic_author_directory' as any, { _ic_id: ic.id })).data || []) as Row[],
  });
  const { data: hits = [] } = useQuery({
    queryKey: ['aksob-search', q], enabled: open && q.trim().length >= 2,
    queryFn: () => searchAksobFaculty(q),
  });
  const me = rows.find((r) => r.faculty_id === facultyId);
  const confirmed = rows.filter((r) => r.link_status === 'confirmed');
  const suggested = rows.filter((r) => r.link_status === 'proposed');
  const sameDept = me ? confirmed.filter((r) => (r.department || '') === (me.department || '')).length : 0;
  const linked = new Set(rows.filter((r) => r.link_status !== 'rejected').map((r) => r.faculty_id));

  const review = async (linkId: string, d: 'confirmed' | 'rejected') => {
    setBusy(true);
    const { error } = await supabase.rpc('review_author_link', { _link_id: linkId, _decision: d, _note: null });
    setBusy(false);
    if (error) return toast.error(friendlyWriteError(error));
    toast.success(d === 'confirmed' ? 'Co-author confirmed' : 'Suggestion rejected');
    refetch(); qc.invalidateQueries();
  };
  const suggest = async (fid: string) => {
    setBusy(true);
    try { await suggestCoauthor(ic.id, fid); toast.success('Co-author suggested — an admin will confirm'); setQ(''); refetch(); qc.invalidateQueries(); }
    catch (e) { toast.error(friendlyWriteError(e)); }
    setBusy(false);
  };
  const Item = ({ r }: { r: Row }) => (
    <div className="flex items-center justify-between rounded border p-2 text-sm">
      <span>{r.full_name} <span className="text-xs text-muted-foreground">{r.department || '—'}{r.discipline ? ` · ${r.discipline}` : ''}</span></span>
      {isAdmin && r.link_status === 'proposed' && (
        <span className="flex gap-1">
          <Button size="sm" disabled={busy} onClick={() => review(r.link_id, 'confirmed')}>Confirm</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => review(r.link_id, 'rejected')}>Reject</Button>
        </span>
      )}
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif">AKSOB Co-Authors</DialogTitle></DialogHeader>
        <p className="text-sm">{ic?.title}</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Total authors</p><p className="font-bold">{ic?.total_authors ?? '—'}</p></div>
          <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Confirmed AKSOB</p><p className="font-bold">{confirmed.length}</p></div>
          <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Confirmed, same dept</p><p className="font-bold">{sameDept}</p></div>
        </div>
        {ic?.authors && <p className="text-xs text-muted-foreground">As published: {ic.authors}</p>}
        <section className="space-y-1"><h3 className="text-sm font-semibold">Confirmed</h3>{confirmed.length ? confirmed.map((r) => <Item key={r.link_id} r={r} />) : <p className="text-xs text-muted-foreground">None yet.</p>}</section>
        <section className="space-y-1"><h3 className="text-sm font-semibold">Suggested — awaiting admin</h3>{suggested.length ? suggested.map((r) => <Item key={r.link_id} r={r} />) : <p className="text-xs text-muted-foreground">None.</p>}</section>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Suggest a missing AKSOB co-author</h3>
          <Input placeholder="Search faculty by name" value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.map((h) => (
            <div key={h.faculty_id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>{h.first_name} {h.last_name} <span className="text-xs text-muted-foreground">{h.department}{h.discipline ? ` · ${h.discipline}` : ''}</span></span>
              {linked.has(h.faculty_id) ? <Badge variant="outline">Listed</Badge> : <Button size="sm" variant="outline" disabled={busy} onClick={() => suggest(h.faculty_id)}>Suggest</Button>}
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Suggestions never count until an admin confirms them. If a co-author has no AKSOB profile, tell an admin instead of adding anyone.</p>
        </section>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveIcButton({ ic, facultyId, shared }: { ic: any; facultyId: string; shared: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = user?.role === 'admin';
  const verified = ic.verification_status === 'verified';
  const msg = isAdmin ? 'Archive this publication. It stops counting everywhere and can be restored from the Verification Queue.'
    : shared ? 'This publication is shared with other AKSOB authors. Your request removes only you, after an admin approves it. Co-authors keep the publication.'
    : verified ? 'This publication is verified. Removal needs admin approval.'
    : 'This publication will be archived and stop counting. History and evidence are kept; an admin can restore it.';
  const go = async () => {
    setBusy(true);
    try {
      const r = await requestIcRemoval(ic.id, facultyId, reason);
      toast.success(r === 'archived' ? 'Publication removed (archived)' : r === 'already_requested' ? 'You already requested this' : 'Removal request sent to an admin');
      setOpen(false); qc.invalidateQueries();
    } catch (e) { toast.error(friendlyWriteError(e)); }
    setBusy(false);
  };
  return (
    <>
      <Button variant="ghost" size="sm" aria-label="Remove contribution" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}><Trash2 className="h-3.5 w-3.5" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif">Remove contribution</DialogTitle></DialogHeader>
          <p className="text-sm">{ic.title}</p>
          <p className="text-sm text-muted-foreground">{msg}</p>
          <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={go}>{isAdmin || (!shared && !verified) ? 'Remove' : 'Send request'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CoAuthorsButton({ ic, facultyId }: { ic: any; facultyId: string }) {
  const [open, setOpen] = useState(false);
  return (<>
    <Button variant="ghost" size="sm" aria-label="AKSOB co-authors" onClick={() => setOpen(true)}><Users className="h-3.5 w-3.5" /></Button>
    {open && <CoAuthorsDialog ic={ic} facultyId={facultyId} open={open} onClose={() => setOpen(false)} />}
  </>);
}
