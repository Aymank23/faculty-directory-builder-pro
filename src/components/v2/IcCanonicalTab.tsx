import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { BookOpen, Pencil, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchFacultyCanonical, SHARED_FIELDS } from '@/lib/canonicalData';
import {
  deriveTable81Type, normalizePortfolio, pointsFor, ineligibilityReason, confirmedAuthors,
  HISTORICAL_TYPES, PORTFOLIOS,
} from '@/lib/table81';
import { VERIFICATION_STATUS_LABELS } from '@/lib/icTaxonomy';

const fmt = (n: number) => (n ? n.toFixed(2) : '—');

const FIELD_LABELS: Record<string, string> = {
  title: 'Title', year: 'Year', journal_outlet: 'Journal / Outlet', doi: 'DOI', authors: 'Authors (as published)',
  total_authors: 'Total Authors', quartile: 'Quartile', scholarship_portfolio: 'Scholarship Portfolio',
  historical_reporting_type: 'AKSOB Reporting Type (historical)', apa_citation: 'Citation',
};

export default function IcCanonicalTab({ facultyId, department }: { facultyId: string; department?: string | null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const { data, isLoading } = useQuery({
    queryKey: ['v2-faculty-ics', facultyId],
    queryFn: () => fetchFacultyCanonical(facultyId),
  });
  const { data: pending = [] } = useQuery({
    queryKey: ['v2-change-requests', facultyId, data?.ics.length],
    queryFn: async () => {
      const ids = (data?.ics || []).map((i) => i.id);
      if (!ids.length) return [];
      const { data: rows } = await supabase.from('canonical_ic_change_requests').select('*').in('canonical_ic_id', ids).eq('status', 'pending');
      return rows || [];
    },
    enabled: !!data,
  });

  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const ics = data?.ics || [];
  const authors = data?.authors || [];

  const open = (ic: any | null) => {
    setEditing(ic || { id: null });
    const f: Record<string, string> = {};
    SHARED_FIELDS.forEach((k) => (f[k] = ic?.[k] == null ? '' : String(ic[k])));
    if (!ic) f.historical_reporting_type = 'Needs Review';
    setForm(f);
    setReason('');
  };

  const refresh = () => qc.invalidateQueries();

  const save = async () => {
    if (!form.title?.trim()) return toast.error('Title is required');
    setSaving(true);
    const payload: Record<string, any> = {};
    SHARED_FIELDS.forEach((k) => {
      const v = form[k]?.trim() || null;
      payload[k] = (k === 'year' || k === 'total_authors') && v ? Number.parseInt(v, 10) : v;
    });
    try {
      if (!editing.id) {
        const { data: created, error } = await supabase
          .from('canonical_ics')
          .insert({ ...payload, historical_reporting_type: payload.historical_reporting_type || 'Needs Review', created_by: user!.id, verification_status: 'under_review', eligibility: 'conditional', condition_note: 'New entry — awaiting review' })
          .select('id').single();
        if (error) throw error;
        const { error: e2 } = await supabase.from('ic_authors').insert({ canonical_ic_id: created.id, faculty_id: facultyId, department_snapshot: department, link_status: 'confirmed', confirmed_at: new Date().toISOString() });
        if (e2) throw e2;
        toast.success('Intellectual contribution added (Under Review)');
      } else {
        const changed = SHARED_FIELDS.filter((k) => String(editing[k] ?? '') !== String(payload[k] ?? ''));
        if (!changed.length) { setEditing(null); setSaving(false); return; }
        const shared = confirmedAuthors(authors, editing.id).length > 1;
        if (shared && !isAdmin) {
          const rows = changed.map((k) => ({ canonical_ic_id: editing.id, proposed_by: user!.id, field: k, old_value: editing[k] == null ? null : String(editing[k]), new_value: payload[k] == null ? null : String(payload[k]), reason: reason || null }));
          const { error } = await supabase.from('canonical_ic_change_requests').insert(rows);
          if (error) throw error;
          toast.success('Shared publication — change proposed for admin approval');
        } else {
          const upd = Object.fromEntries(changed.map((k) => [k, payload[k]]));
          const { error } = await supabase.from('canonical_ics').update(upd).eq('id', editing.id);
          if (error) throw error;
          toast.success('Saved' + (editing.verification_status === 'verified' && !isAdmin ? ' — returned to Under Review' : ''));
        }
      }
      setEditing(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    }
    setSaving(false);
  };

  const pendingFor = (id: string) => pending.filter((p: any) => p.canonical_ic_id === id).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-muted text-primary"><BookOpen className="h-5 w-5" /></div>
          <div>
            <CardTitle className="font-serif text-base">Intellectual Contributions ({ics.length})</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              School Points = 1 / AKSOB authors · Department Points = 1 / same-department AKSOB authors. Only Verified, eligible ICs enter Table 8.1.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => open(null)}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : ics.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No intellectual contributions linked yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead><TableHead>Year</TableHead><TableHead>Scholarship Portfolio</TableHead>
                  <TableHead>IC Reporting Type</TableHead><TableHead className="text-right">Total Authors</TableHead>
                  <TableHead className="text-right">AKSOB Authors</TableHead><TableHead className="text-right">Same-Dept AKSOB</TableHead>
                  <TableHead className="text-right">School Pts</TableHead><TableHead className="text-right">Dept Pts</TableHead>
                  <TableHead>Status</TableHead><TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ics.map((ic) => {
                  const p = pointsFor(authors, ic.id, facultyId);
                  const reasonTxt = ineligibilityReason(ic);
                  const proposedLinks = authors.filter((a) => a.canonical_ic_id === ic.id && a.link_status === 'proposed').length;
                  return (
                    <TableRow key={ic.id}>
                      <TableCell className="text-sm max-w-md">
                        {ic.title || '—'}
                        {ic.journal_outlet && <div className="text-xs text-muted-foreground">{ic.journal_outlet}</div>}
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {p.aksobAuthors > 1 && <Badge variant="outline" className="text-[10px]"><Users className="h-3 w-3 mr-1" />Shared</Badge>}
                          {proposedLinks > 0 && <Badge variant="outline" className="text-[10px]">{proposedLinks} co-author link(s) proposed</Badge>}
                          {pendingFor(ic.id) > 0 && <Badge variant="secondary" className="text-[10px]">Change proposed</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{ic.year || '—'}</TableCell>
                      <TableCell className="text-sm">{normalizePortfolio(ic.scholarship_portfolio) || <Badge variant="outline" className="text-[10px]">Needs review</Badge>}</TableCell>
                      <TableCell className="text-sm">
                        {deriveTable81Type(ic.historical_reporting_type) || <Badge variant="outline" className="text-[10px]">Needs review</Badge>}
                        <div className="text-[11px] text-muted-foreground">{ic.historical_reporting_type}</div>
                      </TableCell>
                      <TableCell className="text-right text-sm">{ic.total_authors ?? '—'}</TableCell>
                      <TableCell className="text-right text-sm">{p.aksobAuthors}</TableCell>
                      <TableCell className="text-right text-sm">{p.sameDeptAuthors}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(p.schoolPoints)}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(p.departmentPoints)}</TableCell>
                      <TableCell className="text-sm">
                        <Badge variant={ic.verification_status === 'verified' ? 'default' : ic.verification_status === 'excluded' ? 'destructive' : 'secondary'}>
                          {VERIFICATION_STATUS_LABELS[(ic.verification_status as 'verified') || 'under_review']}
                        </Badge>
                        {reasonTxt && reasonTxt !== 'Under Review' && reasonTxt !== 'Excluded' && <div className="text-[11px] text-muted-foreground mt-1">{reasonTxt}</div>}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" aria-label="Edit contribution" onClick={() => open(ic)}><Pencil className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-2xl">
          <DialogHeader><DialogTitle className="font-serif">{editing?.id ? 'Edit Intellectual Contribution' : 'Add Intellectual Contribution'}</DialogTitle></DialogHeader>
          {editing?.id && confirmedAuthors(authors, editing.id).length > 1 && !isAdmin && (
            <p className="text-xs rounded-md bg-muted p-3 text-muted-foreground">
              This publication is shared with other AKSOB authors. Your changes will be sent as a proposal and applied only after admin approval.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {SHARED_FIELDS.map((k) => (
              <div key={k} className={`space-y-1.5 ${k === 'title' || k === 'apa_citation' || k === 'authors' ? 'col-span-2' : ''}`}>
                <Label>{FIELD_LABELS[k]}{k === 'title' ? ' *' : ''}</Label>
                {k === 'historical_reporting_type' ? (
                  <Select value={form[k] || 'Needs Review'} onValueChange={(v) => setForm({ ...form, [k]: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{HISTORICAL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                ) : k === 'scholarship_portfolio' ? (
                  <Select value={normalizePortfolio(form[k]) || ''} onValueChange={(v) => setForm({ ...form, [k]: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{PORTFOLIOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                ) : k === 'apa_citation' ? (
                  <Textarea rows={2} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                ) : (
                  <Input type={k === 'year' || k === 'total_authors' ? 'number' : 'text'} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                )}
              </div>
            ))}
            {editing?.id && confirmedAuthors(authors, editing.id).length > 1 && !isAdmin && (
              <div className="col-span-2 space-y-1.5"><Label>Reason for change</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">The Table 8.1 type is derived automatically from the AKSOB reporting type and cannot be edited directly.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
