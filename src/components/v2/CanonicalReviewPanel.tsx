import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSchoolCanonical } from '@/lib/canonicalData';
import { getEvidenceUrl } from '@/lib/evidence';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, XCircle, RotateCcw, FileText } from 'lucide-react';
import { deriveTable81Type, ineligibilityReason, normalizePortfolio } from '@/lib/table81';

const STATUS_LABEL: Record<string, string> = { verified: 'Verified', under_review: 'Under Review', excluded: 'Excluded' };
const errMsg = (e: any) => String(e?.message || e).replace(/^.*?:\s*(?=[A-Z])/, '');

export default function CanonicalReviewPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isHod = user?.role === 'hod';
  const qc = useQueryClient();
  const [status, setStatus] = useState('under_review');
  const [flag, setFlag] = useState('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ['v2-review'], queryFn: fetchSchoolCanonical });
  const { data: crs = [] } = useQuery({
    queryKey: ['v2-review-cr'],
    queryFn: async () => (await supabase.from('canonical_ic_change_requests').select('*').order('created_at', { ascending: false }).limit(1000)).data || [],
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['v2-review'] }); qc.invalidateQueries({ queryKey: ['v2-review-cr'] }); qc.invalidateQueries({ queryKey: ['v2-audit'] }); qc.invalidateQueries({ queryKey: ['v2-school'] }); qc.invalidateQueries({ queryKey: ['v2-fac'] }); };

  const fmap = useMemo(() => new Map((data?.faculty || []).map((f: any) => [f.faculty_id, f])), [data]);
  const name = (id: string) => { const f: any = fmap.get(id); return f ? `${f.first_name} ${f.last_name}` : 'Faculty outside your scope'; };
  const authorsOf = (id: string) => (data?.authors || []).filter((a) => a.canonical_ic_id === id);
  const pendingCr = (id: string) => crs.filter((c: any) => c.canonical_ic_id === id && c.status === 'pending');

  const rows = (data?.ics || []).filter((ic) => {
    if (status !== 'all' && ic.verification_status !== status) return false;
    if (flag === 'links' && !authorsOf(ic.id).some((a) => a.link_status === 'proposed')) return false;
    if (flag === 'changes' && !pendingCr(ic.id).length) return false;
    if (flag === 'conditional' && ic.eligibility !== 'conditional') return false;
    if (q && !`${ic.title} ${ic.doi || ''} ${authorsOf(ic.id).map((a) => name(a.faculty_id)).join(' ')}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const open = (data?.ics || []).find((i) => i.id === openId);

  const counts = {
    links: (data?.authors || []).filter((a) => a.link_status === 'proposed').length,
    changes: crs.filter((c: any) => c.status === 'pending').length,
    conditional: (data?.ics || []).filter((i) => i.eligibility === 'conditional' && i.verification_status === 'under_review').length,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold font-serif text-foreground">Verification Queue</h1>
        <p className="text-sm text-muted-foreground">
          Shared publications that feed Table 8.1. {isAdmin ? 'You are the final authority for co-author links and shared changes.' : isHod ? 'You can verify publications whose confirmed authors are all in your department, and recommend on proposals. Admin confirms co-authors and shared changes.' : ''}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <button className="rounded-lg border p-3 text-left hover:border-primary" onClick={() => { setFlag('links'); setStatus('all'); }}><p className="text-xs text-muted-foreground">Proposed co-author links</p><p className="text-xl font-bold">{counts.links}</p></button>
        <button className="rounded-lg border p-3 text-left hover:border-primary" onClick={() => { setFlag('changes'); setStatus('all'); }}><p className="text-xs text-muted-foreground">Pending change proposals</p><p className="text-xl font-bold">{counts.changes}</p></button>
        <button className="rounded-lg border p-3 text-left hover:border-primary" onClick={() => { setFlag('conditional'); setStatus('under_review'); }}><p className="text-xs text-muted-foreground">Conditional classifications</p><p className="text-xl font-bold">{counts.conditional}</p></button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Search title, DOI, author" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="under_review">Under Review</SelectItem><SelectItem value="verified">Verified</SelectItem><SelectItem value="excluded">Excluded</SelectItem></SelectContent>
        </Select>
        <Select value={flag} onValueChange={setFlag}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All publications</SelectItem><SelectItem value="links">With proposed co-authors</SelectItem><SelectItem value="changes">With pending changes</SelectItem><SelectItem value="conditional">Conditional classification</SelectItem></SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Year</TableHead><TableHead>AKSOB authors</TableHead><TableHead>Classification</TableHead><TableHead>Status</TableHead><TableHead>Table 8.1</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No publications match.</TableCell></TableRow>}
              {rows.map((ic) => {
                const au = authorsOf(ic.id);
                const reason = ineligibilityReason(ic);
                return (
                  <TableRow key={ic.id}>
                    <TableCell className="text-sm max-w-md">{ic.title}<div className="text-xs text-muted-foreground">{ic.journal_outlet}{ic.doi ? ` · ${ic.doi}` : ''}</div></TableCell>
                    <TableCell>{ic.year}</TableCell>
                    <TableCell className="text-xs">
                      {au.map((a) => <div key={a.id}>{name(a.faculty_id)} {a.link_status !== 'confirmed' && <Badge variant="outline" className="text-[10px] ml-1">{a.link_status}</Badge>}</div>)}
                    </TableCell>
                    <TableCell className="text-xs">{deriveTable81Type(ic.historical_reporting_type) || 'Needs review'}<div className="text-muted-foreground">{ic.eligibility}</div></TableCell>
                    <TableCell><Badge variant={ic.verification_status === 'verified' ? 'default' : ic.verification_status === 'excluded' ? 'destructive' : 'secondary'}>{STATUS_LABEL[ic.verification_status]}</Badge>{pendingCr(ic.id).length > 0 && <Badge variant="outline" className="ml-1 text-[10px]">change proposed</Badge>}</TableCell>
                    <TableCell className="text-xs">{reason ? <span className="text-muted-foreground">{reason}</span> : <span className="text-primary font-medium">Counts</span>}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => setOpenId(ic.id)}>Review</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          {open && <ReviewBody ic={open} authors={authorsOf(open.id)} crs={crs.filter((c: any) => c.canonical_ic_id === open.id)} name={name} isAdmin={isAdmin} isHod={isHod} onDone={refresh} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewBody({ ic, authors, crs, name, isAdmin, isHod, onDone }: any) {
  const [note, setNote] = useState('');
  const [elig, setElig] = useState<string>(ic.eligibility);
  const [busy, setBusy] = useState(false);
  const { data: audit = [] } = useQuery({
    queryKey: ['v2-audit', ic.id],
    queryFn: async () => {
      const linkIds = authors.map((a: any) => a.id);
      const crIds = crs.map((c: any) => c.id);
      const ids = [ic.id, ...linkIds, ...crIds];
      return (await supabase.from('audit_log').select('*').in('target_record', ids).order('created_at', { ascending: false }).limit(200)).data || [];
    },
  });

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success(ok); onDone();
  };
  const verify = (s: string) => run(() => supabase.rpc('set_canonical_verification', { _id: ic.id, _status: s, _eligibility: elig, _note: note || null }), `Marked ${STATUS_LABEL[s]}`);
  const link = (id: string, d: string) => run(() => supabase.rpc('review_author_link', { _link_id: id, _decision: d, _note: note || null }), d === 'confirmed' ? 'Co-author confirmed' : 'Co-author link rejected');
  const cr = (id: string, d: string) => run(() => supabase.rpc('review_change_request', { _id: id, _decision: d, _note: note || null }), d === 'approved' ? 'Change applied' : 'Change rejected');
  const recommend = (id: string, d: string) => run(() => supabase.from('canonical_ic_change_requests').update({ hod_recommendation: d, hod_note: note || null }).eq('id', id), 'Recommendation recorded');
  const openEvidence = async () => { try { window.open(await getEvidenceUrl(ic.evidence_file_url), '_blank'); } catch { toast.error('Could not open evidence'); } };

  const reviewer = isAdmin || isHod;
  return (
    <div className="space-y-5">
      <DialogHeader><DialogTitle className="font-serif text-lg">{ic.title}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {[['Year', ic.year], ['Outlet', ic.journal_outlet], ['DOI', ic.doi], ['Authors (citation)', ic.authors], ['Quartile', ic.quartile], ['ABDC', ic.abdc_rank],
          ['Scholarship portfolio', normalizePortfolio(ic.scholarship_portfolio) || ic.scholarship_portfolio || '—'], ['AKSOB reporting type (historical)', ic.historical_reporting_type],
          ['Table 8.1 type (derived)', deriveTable81Type(ic.historical_reporting_type) || 'Needs review'], ['Original CV item type', ic.original_cv_item_type], ['Condition note', ic.condition_note], ['Status', STATUS_LABEL[ic.verification_status]]]
          .map(([k, v]) => <div key={k as string}><span className="text-muted-foreground">{k}: </span>{(v as any) || '—'}</div>)}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Evidence:</span>
        {ic.evidence_file_url ? <Button size="sm" variant="outline" onClick={openEvidence}><FileText className="h-4 w-4 mr-1" /> Open</Button> : <span>None uploaded</span>}
      </div>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">AKSOB co-authors</h3>
        {authors.map((a: any) => (
          <div key={a.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <span>{name(a.faculty_id)} <span className="text-xs text-muted-foreground">{a.department_snapshot}</span> <Badge variant={a.link_status === 'confirmed' ? 'default' : 'outline'} className="ml-1 text-[10px]">{a.link_status}</Badge></span>
            {isAdmin && a.link_status === 'proposed' && (
              <span className="flex gap-1">
                <Button size="sm" disabled={busy} onClick={() => link(a.id, 'confirmed')}>Confirm</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => link(a.id, 'rejected')}>Reject</Button>
              </span>
            )}
          </div>
        ))}
        {!isAdmin && authors.some((a: any) => a.link_status === 'proposed') && <p className="text-xs text-muted-foreground">Only an admin can confirm proposed co-authors. A DOI match is a suggestion, not a confirmation.</p>}
      </section>

      {crs.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-sm">Change proposals</h3>
          {crs.map((c: any) => (
            <div key={c.id} className="rounded border p-2 text-sm space-y-1">
              <div><span className="font-medium">{c.field}</span>: <span className="line-through text-muted-foreground">{c.old_value || '—'}</span> → {c.new_value || '—'}</div>
              <div className="text-xs text-muted-foreground">Proposed by {name(c.proposed_by) === 'Faculty outside your scope' ? 'a linked author' : name(c.proposed_by)} · {c.reason || 'no reason given'} · <Badge variant="outline" className="text-[10px]">{c.status}</Badge>{c.hod_recommendation && ` · HoD recommends ${c.hod_recommendation}`}</div>
              {c.status === 'pending' && (
                <div className="flex gap-1">
                  {isAdmin && <><Button size="sm" disabled={busy} onClick={() => cr(c.id, 'approved')}>Approve & apply</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => cr(c.id, 'rejected')}>Reject</Button></>}
                  {isHod && <><Button size="sm" variant="outline" disabled={busy} onClick={() => recommend(c.id, 'approve')}>Recommend approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => recommend(c.id, 'reject')}>Recommend reject</Button></>}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {reviewer && (
        <section className="space-y-2">
          <h3 className="font-semibold text-sm">Review decision</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Crosswalk classification</span>
            <Select value={elig} onValueChange={setElig}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="include">Include</SelectItem><SelectItem value="conditional">Conditional</SelectItem><SelectItem value="exclude">Exclude</SelectItem></SelectContent>
            </Select>
          </div>
          <Textarea placeholder="Reviewer note (recorded in audit history)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => verify('verified')}><CheckCircle className="h-4 w-4 mr-1" /> Verify</Button>
            <Button disabled={busy} variant="outline" onClick={() => verify('under_review')}><RotateCcw className="h-4 w-4 mr-1" /> Return to Under Review</Button>
            <Button disabled={busy} variant="destructive" onClick={() => verify('excluded')}><XCircle className="h-4 w-4 mr-1" /> Exclude</Button>
          </div>
        </section>
      )}

      <section className="space-y-1">
        <h3 className="font-semibold text-sm">Audit history</h3>
        {audit.length === 0 && <p className="text-xs text-muted-foreground">No history visible.</p>}
        {audit.map((e: any) => (
          <div key={e.id} className="text-xs border-b py-1">
            <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span> · <span className="font-medium">{e.action}</span>
            {e.details?.note && <> · “{e.details.note}”</>}
            {e.action === 'canonical_ic_updated' && <> · {Object.keys(e.details || {}).join(', ')}</>}
          </div>
        ))}
      </section>
    </div>
  );
}
