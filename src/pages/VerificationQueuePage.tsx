import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckSquare, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { normalizeDepartment } from '@/lib/normalize';

const VerificationQueuePage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedIc, setSelectedIc] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

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

  const facultyIds = faculty.map(f => f.faculty_id);
  const facultyMap = Object.fromEntries(faculty.map(f => [f.faculty_id, `${f.first_name} ${f.last_name}`]));

  const { data: pendingIcs = [] } = useQuery({
    queryKey: ['pending-ics', facultyIds],
    queryFn: async () => {
      if (facultyIds.length === 0) return [];
      const { data } = await supabase.from('intellectual_contributions').select('*').in('faculty_id', facultyIds).eq('status', 'under_review').order('created_at', { ascending: true });
      return data || [];
    },
    enabled: facultyIds.length > 0,
  });

  const handleVerify = async (ic: any) => {
    if (!ic.evidence_file_url) {
      toast.error('Cannot verify: No evidence file attached.');
      return;
    }
    const { error } = await supabase.from('intellectual_contributions').update({
      status: 'verified', verification_date: new Date().toISOString(), verified_by: user!.id,
    }).eq('ic_id', ic.ic_id);
    if (error) { toast.error('Verification failed'); return; }
    await supabase.from('audit_log').insert({
      user_id: user!.id, action: 'ic_verified', target_record: ic.ic_id, target_table: 'intellectual_contributions',
      details: { title: ic.title, faculty_id: ic.faculty_id },
    });
    toast.success('Contribution verified');
    queryClient.invalidateQueries({ queryKey: ['pending-ics'] });
  };

  const handleReject = async () => {
    if (!selectedIc) return;
    const { error } = await supabase.from('intellectual_contributions').update({
      status: 'rejected', rejection_reason: rejectReason || null,
    }).eq('ic_id', selectedIc.ic_id);
    if (error) { toast.error('Rejection failed'); return; }
    await supabase.from('audit_log').insert({
      user_id: user!.id, action: 'ic_rejected', target_record: selectedIc.ic_id, target_table: 'intellectual_contributions',
      details: { title: selectedIc.title, reason: rejectReason },
    });
    toast.success('Contribution rejected');
    setRejectDialogOpen(false); setRejectReason(''); setSelectedIc(null);
    queryClient.invalidateQueries({ queryKey: ['pending-ics'] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('intellectual_contributions').delete().eq('ic_id', deleteTarget.ic_id);
    if (error) { toast.error('Delete failed'); setDeleting(false); return; }
    await supabase.from('audit_log').insert({
      user_id: user!.id, action: 'ic_deleted', target_record: deleteTarget.ic_id, target_table: 'intellectual_contributions',
      details: { title: deleteTarget.title },
    });
    toast.success('Contribution deleted');
    setDeleteTarget(null); setDeleting(false);
    queryClient.invalidateQueries({ queryKey: ['pending-ics'] });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">Verification Queue</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? 'All departments' : user?.department} — Review submitted intellectual contributions
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            {pendingIcs.length === 0 ? (
              <div className="text-center py-16">
                <CheckSquare className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No items pending verification.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Faculty</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Quartile</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingIcs.map(ic => (
                    <TableRow key={ic.ic_id}>
                      <TableCell className="font-medium">{facultyMap[ic.faculty_id] || 'Unknown'}</TableCell>
                      <TableCell className="max-w-xs truncate">{ic.title}</TableCell>
                      <TableCell>{ic.ic_type || '—'}</TableCell>
                      <TableCell>{ic.year || '—'}</TableCell>
                      <TableCell>{ic.quartile || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={ic.evidence_file_url ? 'default' : 'outline'} className="text-xs">
                          {ic.evidence_file_url ? 'Uploaded' : 'Missing'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleVerify(ic)} className="text-success">
                            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Verify
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setSelectedIc(ic); setRejectDialogOpen(true); }} className="text-destructive">
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
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
            <DialogHeader><DialogTitle className="font-serif">Reject Contribution</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Rejecting: <strong>{selectedIc?.title}</strong></p>
              <Textarea placeholder="Reason for rejection (optional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleReject}>Reject</Button>
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
