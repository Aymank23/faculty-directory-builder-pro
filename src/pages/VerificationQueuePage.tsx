import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { IC_REPORTING_TYPES } from '@/lib/icTaxonomy';
import { verificationLabel, verificationVariant, verificationStatusOf } from '@/lib/icMetrics';
import { getEvidenceUrl } from '@/lib/evidence';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckSquare, CheckCircle, XCircle, Trash2, RotateCcw, FileText } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { disciplines } from '@/lib/constants';
import { normalizeDepartment, normalizeDiscipline } from '@/lib/normalize';

const RECORD_CLASSES = [
  { value: 'ic', label: 'Intellectual Contribution' },
  { value: 'academic_engagement', label: 'Academic Engagement' },
];

const VerificationQueuePage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedIc, setSelectedIc] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [disciplineFilter, setDisciplineFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('under_review');
  const [classFilter, setClassFilter] = useState('all');

  const isAdmin = user?.role === 'admin';
  const userDept = user?.department ? normalizeDepartment(user.department) : '';

  // Department scope: fetch all faculty, then filter client-side via the
  // canonical department label so legacy aliases (MKT, MGT, …) all match.
  const { data: faculty = [] } = useQuery({
    queryKey: ['verify-faculty', user?.role, userDept],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*');
      const rows = data || [];
      if (isAdmin || !userDept) return rows;
      return rows.filter(f => normalizeDepartment(f.department) === userDept);
    },
  });

  const scopedFaculty = disciplineFilter === 'all'
    ? faculty
    : faculty.filter((f: any) => normalizeDiscipline(f.discipline) === disciplineFilter);
  const facultyIds = scopedFaculty.map((f: any) => f.faculty_id);
  const facultyMap = Object.fromEntries(scopedFaculty.map((f: any) => [f.faculty_id, `${f.first_name} ${f.last_name}`]));

  // All records are loaded; verification_status is the single authoritative
  // field and is filtered client-side so admins can return items to review.
  const { data: allRecords = [] } = useQuery({
    queryKey: ['pending-ics', facultyIds],
    queryFn: async () => {
      if (facultyIds.length === 0) return [];
      const { data } = await supabase
        .from('intellectual_contributions')
        .select('*')
        .in('faculty_id', facultyIds)
        .order('created_at', { ascending: true });
      return data || [];
    },
    enabled: facultyIds.length > 0,
  });

  const records = allRecords.filter((r: any) => {
    if (statusFilter !== 'all' && verificationStatusOf(r) !== statusFilter) return false;
    if (classFilter !== 'all' && (r.record_class || 'ic') !== classFilter) return false;
    return true;
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pending-ics'] });

  const audit = (action: string, ic: any, details: Record<string, unknown>) =>
    supabase.from('audit_log').insert({
      user_id: user!.id, action, target_record: ic.ic_id,
      target_table: 'intellectual_contributions', details: details as any,
    });

  const handleReportingTypeChange = async (ic: any, value: string) => {
    const { error } = await supabase
      .from('intellectual_contributions')
      .update({ ic_reporting_type: value, updated_at: new Date().toISOString() } as any)
      .eq('ic_id', ic.ic_id);
    if (error) { toast.error('Could not update reporting type'); return; }
    await audit('ic_reporting_type_changed', ic, { from: ic.ic_reporting_type, to: value, title: ic.title });
    toast.success('Reporting type updated');
    refresh();
  };

  // Reclassification between Intellectual Contribution and Academic Engagement.
  // Original CV Item Type is never touched.
  const handleRecordClassChange = async (ic: any, value: string) => {
    const patch: Record<string, unknown> = {
      record_class: value,
      verification_status: 'under_review',
      reclassified_by: user!.id,
      reclassified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (value === 'academic_engagement') patch.ic_reporting_type = 'Not Applicable';
    else if (ic.ic_reporting_type === 'Not Applicable') patch.ic_reporting_type = 'Needs Review';

    const { error } = await supabase.from('intellectual_contributions').update(patch as any).eq('ic_id', ic.ic_id);
    if (error) { toast.error('Could not reclassify record'); return; }
    await audit('ic_reclassified', ic, { from: ic.record_class, to: value, title: ic.title });
    toast.success('Record reclassified — returned to Under Review');
    refresh();
  };

  const handleVerify = async (ic: any) => {
    if ((ic.record_class || 'ic') === 'ic' && (ic.ic_reporting_type || 'Needs Review') === 'Needs Review') {
      toast.error('Set an IC Reporting Type before verifying.');
      return;
    }
    if (!ic.evidence_file_url) {
      toast.error('Cannot verify: no evidence file attached.');
      return;
    }
    const { error } = await supabase.from('intellectual_contributions').update({
      verification_status: 'verified',
      verification_date: new Date().toISOString(),
      verified_by: user!.id,
      rejection_reason: null,
    } as any).eq('ic_id', ic.ic_id);
    if (error) { toast.error('Verification failed'); return; }
    await audit('ic_verified', ic, { title: ic.title, faculty_id: ic.faculty_id });
    toast.success('Contribution verified');
    refresh();
  };

  const handleReturnToReview = async (ic: any) => {
    const { error } = await supabase.from('intellectual_contributions').update({
      verification_status: 'under_review', verification_date: null, verified_by: null,
    } as any).eq('ic_id', ic.ic_id);
    if (error) { toast.error('Could not return to review'); return; }
    await audit('ic_returned_to_review', ic, { title: ic.title, from: verificationStatusOf(ic) });
    toast.success('Returned to Under Review');
    refresh();
  };

  const handleExclude = async () => {
    if (!selectedIc) return;
    const { error } = await supabase.from('intellectual_contributions').update({
      verification_status: 'excluded', rejection_reason: rejectReason || null,
    } as any).eq('ic_id', selectedIc.ic_id);
    if (error) { toast.error('Could not exclude record'); return; }
    await audit('ic_excluded', selectedIc, { title: selectedIc.title, reason: rejectReason });
    toast.success('Record excluded from totals');
    setRejectDialogOpen(false); setRejectReason(''); setSelectedIc(null);
    refresh();
  };

  const handleViewEvidence = async (ic: any) => {
    if (!ic.evidence_file_url) return;
    const url = await getEvidenceUrl(ic.evidence_file_url);
    window.open(url, '_blank');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('intellectual_contributions').delete().eq('ic_id', deleteTarget.ic_id);
    if (error) { toast.error('Delete failed'); setDeleting(false); return; }
    await audit('ic_deleted', deleteTarget, { title: deleteTarget.title });
    toast.success('Contribution deleted');
    setDeleteTarget(null); setDeleting(false);
    refresh();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">Verification Queue</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? 'All departments' : user?.department} — review, reclassify, verify, return to review or exclude records
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="excluded">Excluded</SelectItem>
              </SelectContent>
            </Select>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Record type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Record Types</SelectItem>
                {RECORD_CLASSES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Discipline" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Disciplines</SelectItem>
                {disciplines.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {records.length === 0 ? (
              <div className="text-center py-16">
                <CheckSquare className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No records match the current filters.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Faculty</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Original CV Type</TableHead>
                    <TableHead className="min-w-[200px]">Record Class</TableHead>
                    <TableHead className="min-w-[210px]">IC Reporting Type</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((ic: any) => (
                    <TableRow key={ic.ic_id}>
                      <TableCell className="font-medium">{facultyMap[ic.faculty_id] || 'Unknown'}</TableCell>
                      <TableCell className="max-w-xs truncate">{ic.title}</TableCell>
                      <TableCell className="text-xs">{ic.original_cv_item_type || ic.ic_type || '—'}</TableCell>
                      <TableCell>
                        <Select value={ic.record_class || 'ic'} onValueChange={v => handleRecordClassChange(ic, v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RECORD_CLASSES.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={ic.ic_reporting_type || 'Needs Review'}
                          onValueChange={v => handleReportingTypeChange(ic, v)}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {IC_REPORTING_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{ic.year || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={verificationVariant(ic)} className="text-xs">{verificationLabel(ic)}</Badge>
                      </TableCell>
                      <TableCell>
                        {ic.evidence_file_url ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleViewEvidence(ic)}>
                            <FileText className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-xs">Missing</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          {verificationStatusOf(ic) !== 'verified' && (
                            <Button size="sm" variant="outline" onClick={() => handleVerify(ic)} className="text-success">
                              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Verify
                            </Button>
                          )}
                          {verificationStatusOf(ic) !== 'under_review' && (
                            <Button size="sm" variant="outline" onClick={() => handleReturnToReview(ic)}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Return to review
                            </Button>
                          )}
                          {verificationStatusOf(ic) !== 'excluded' && (
                            <Button size="sm" variant="outline" onClick={() => { setSelectedIc(ic); setRejectDialogOpen(true); }} className="text-destructive">
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Exclude
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(ic)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-serif">Exclude Record</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Excluding: <strong>{selectedIc?.title}</strong></p>
              <Textarea placeholder="Reason (optional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleExclude}>Exclude</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleting}
          title="Delete Contribution"
          description={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        />
      </div>
    </AppLayout>
  );
};

export default VerificationQueuePage;
