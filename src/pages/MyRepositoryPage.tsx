import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Library, Search, Eye, Pencil, FileText, ExternalLink, Trash2, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { icStatuses, icCategories, icTypes, quartiles, abdcRanks, indexingDatabases } from '@/lib/constants';
import { toast } from 'sonner';
import { getEvidenceUrl } from '@/lib/evidence';
import * as XLSX from 'xlsx';

const statusVariant = (s: string) => {
  if (s === 'verified') return 'default' as const;
  if (s === 'under_review') return 'secondary' as const;
  if (s === 'rejected') return 'destructive' as const;
  return 'outline' as const;
};

const MyRepositoryPage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || 'all');
  const [quartileFilter, setQuartileFilter] = useState(searchParams.get('quartile') || 'all');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || 'all');
  const [yearFilter, setYearFilter] = useState(searchParams.get('year') || 'all');
  const [viewIc, setViewIc] = useState<any>(null);
  const [editIc, setEditIc] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  // Sync filter changes back to URL (so KPI links keep working & deep-links share)
  useEffect(() => {
    const next: Record<string, string> = {};
    if (statusFilter !== 'all') next.status = statusFilter;
    if (typeFilter !== 'all') next.type = typeFilter;
    if (quartileFilter !== 'all') next.quartile = quartileFilter;
    if (categoryFilter !== 'all') next.category = categoryFilter;
    if (yearFilter !== 'all') next.year = yearFilter;
    setSearchParams(next, { replace: true });
  }, [statusFilter, typeFilter, quartileFilter, categoryFilter, yearFilter, setSearchParams]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setQuartileFilter('all');
    setCategoryFilter('all');
    setYearFilter('all');
  };

  const handleDelete = async (ic: any) => {
    if (!confirm(`Delete "${ic.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('intellectual_contributions').delete().eq('ic_id', ic.ic_id);
    if (error) { toast.error('Delete failed'); return; }
    await supabase.from('audit_log').insert({
      user_id: user!.id, action: 'ic_deleted', target_record: ic.ic_id,
      target_table: 'intellectual_contributions', details: { title: ic.title },
    });
    toast.success('Contribution deleted');
    queryClient.invalidateQueries({ queryKey: ['my-ics'] });
  };

  const openEdit = (ic: any) => {
    setEditIc(ic);
    setEditForm({
      title: ic.title || '',
      apa_citation: ic.apa_citation || '',
      authors: ic.authors || '',
      year: ic.year?.toString() || '',
      journal_outlet: ic.journal_outlet || '',
      ic_category: ic.ic_category || '',
      ic_type: ic.ic_type || '',
      indexing_database: ic.indexing_database || '',
      quartile: ic.quartile || '',
      abdc_rank: ic.abdc_rank || '',
      doi: ic.doi || '',
      impact_factor: ic.impact_factor || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editIc) return;
    setSaving(true);
    const { error } = await supabase.from('intellectual_contributions').update({
      title: editForm.title.trim(),
      apa_citation: editForm.apa_citation || null,
      authors: editForm.authors || null,
      year: editForm.year ? parseInt(editForm.year) : null,
      journal_outlet: editForm.journal_outlet || null,
      ic_category: editForm.ic_category || null,
      ic_type: editForm.ic_type || null,
      indexing_database: editForm.indexing_database || null,
      quartile: editForm.quartile || null,
      abdc_rank: editForm.abdc_rank || null,
      doi: editForm.doi || null,
      impact_factor: editForm.impact_factor || null,
    }).eq('ic_id', editIc.ic_id);

    if (error) { toast.error('Update failed'); setSaving(false); return; }

    await supabase.from('audit_log').insert({
      user_id: user!.id, action: 'ic_edited', target_record: editIc.ic_id,
      target_table: 'intellectual_contributions', details: { title: editForm.title },
    });

    toast.success('Contribution updated');
    setEditIc(null);
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['my-ics'] });
  };

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: ics = [] } = useQuery({
    queryKey: ['my-ics', profile?.faculty_id],
    queryFn: async () => {
      const { data } = await supabase.from('intellectual_contributions').select('*').eq('faculty_id', profile!.faculty_id).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!profile,
  });

  const filtered = ics.filter(ic => {
    const matchSearch = !search || ic.title.toLowerCase().includes(search.toLowerCase()) || (ic.authors || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || ic.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const canEdit = (ic: any) => ic.status === 'draft' || ic.status === 'rejected';

  const handleExport = () => {
    const rows = filtered.map(ic => ({
      Title: ic.title,
      Type: ic.ic_type || '',
      Category: ic.ic_category || '',
      Quartile: ic.quartile || '',
      Year: ic.year || '',
      'Journal/Outlet': ic.journal_outlet || '',
      Authors: ic.authors || '',
      DOI: ic.doi || '',
      Status: ic.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'My ICs');
    XLSX.writeFile(wb, `My_ICs_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">My Repository</h1>
            <p className="text-sm text-muted-foreground">All your intellectual contributions</p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by title or authors..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {icStatuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Library className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {ics.length === 0
                    ? 'No intellectual contributions have been recorded yet. Use "Add Contribution" to submit your first entry.'
                    : 'No results match your current filters.'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Quartile</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Proof</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(ic => (
                    <TableRow key={ic.ic_id}>
                      <TableCell className="font-medium max-w-xs truncate">{ic.title}</TableCell>
                      <TableCell>{ic.ic_type || '—'}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{ic.ic_category?.split('/')[0] || '—'}</TableCell>
                      <TableCell>{ic.quartile || '—'}</TableCell>
                      <TableCell>{ic.year || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={ic.evidence_file_url ? 'default' : 'outline'} className="text-xs">
                          {ic.evidence_file_url ? 'Uploaded' : 'Missing'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(ic.status)} className="capitalize text-xs">
                          {ic.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setViewIc(ic)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {ic.evidence_file_url && (
                            <Button variant="ghost" size="sm" onClick={async () => {
                              const url = await getEvidenceUrl(ic.evidence_file_url!);
                              window.open(url, '_blank');
                            }}>
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canEdit(ic) && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(ic)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(ic)} className="text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* View Detail Dialog */}
        <Dialog open={!!viewIc} onOpenChange={() => setViewIc(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-serif">{viewIc?.title}</DialogTitle></DialogHeader>
            {viewIc && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Type:</span> {viewIc.ic_type || '—'}</div>
                  <div><span className="text-muted-foreground">Category:</span> {viewIc.ic_category || '—'}</div>
                  <div><span className="text-muted-foreground">Year:</span> {viewIc.year || '—'}</div>
                  <div><span className="text-muted-foreground">Quartile:</span> {viewIc.quartile || '—'}</div>
                  <div><span className="text-muted-foreground">ABDC:</span> {viewIc.abdc_rank || '—'}</div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusVariant(viewIc.status)} className="capitalize text-xs">{viewIc.status.replace('_', ' ')}</Badge></div>
                </div>
                {viewIc.authors && <div><span className="text-muted-foreground">Authors:</span> {viewIc.authors}</div>}
                {viewIc.journal_outlet && <div><span className="text-muted-foreground">Journal:</span> {viewIc.journal_outlet}</div>}
                {viewIc.apa_citation && <div><span className="text-muted-foreground">APA Citation:</span><p className="mt-1 text-xs bg-muted p-2 rounded">{viewIc.apa_citation}</p></div>}
                {viewIc.doi && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">DOI:</span>
                    <a href={viewIc.doi.startsWith('http') ? viewIc.doi : `https://doi.org/${viewIc.doi}`} target="_blank" rel="noopener noreferrer" className="text-primary underline flex items-center gap-1">
                      {viewIc.doi} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {viewIc.evidence_file_url && (
                  <div>
                    <button onClick={async () => {
                      const url = await getEvidenceUrl(viewIc.evidence_file_url!);
                      window.open(url, '_blank');
                    }} className="text-primary underline flex items-center gap-1 text-xs cursor-pointer">
                      <FileText className="h-3.5 w-3.5" /> View Evidence File
                    </button>
                  </div>
                )}
                {viewIc.rejection_reason && (
                  <div className="bg-destructive/10 text-destructive p-2 rounded text-xs">
                    <strong>Rejection Reason:</strong> {viewIc.rejection_reason}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editIc} onOpenChange={() => setEditIc(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-serif">Edit Contribution</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={editForm.title} onChange={e => setEditForm((f: any) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>APA Citation</Label>
                <Textarea value={editForm.apa_citation} onChange={e => setEditForm((f: any) => ({ ...f, apa_citation: e.target.value }))} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Authors</Label>
                  <Input value={editForm.authors} onChange={e => setEditForm((f: any) => ({ ...f, authors: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Input value={editForm.year} onChange={e => setEditForm((f: any) => ({ ...f, year: e.target.value }))} type="number" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Journal / Outlet</Label>
                  <Input value={editForm.journal_outlet} onChange={e => setEditForm((f: any) => ({ ...f, journal_outlet: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>DOI</Label>
                  <Input value={editForm.doi} onChange={e => setEditForm((f: any) => ({ ...f, doi: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>IC Type</Label>
                  <Select value={editForm.ic_type} onValueChange={v => setEditForm((f: any) => ({ ...f, ic_type: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{icTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>IC Category</Label>
                  <Select value={editForm.ic_category} onValueChange={v => setEditForm((f: any) => ({ ...f, ic_category: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{icCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Indexing Database</Label>
                  <Select value={editForm.indexing_database} onValueChange={v => setEditForm((f: any) => ({ ...f, indexing_database: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{indexingDatabases.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quartile</Label>
                  <Select value={editForm.quartile} onValueChange={v => setEditForm((f: any) => ({ ...f, quartile: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{quartiles.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ABDC Rank</Label>
                  <Select value={editForm.abdc_rank} onValueChange={v => setEditForm((f: any) => ({ ...f, abdc_rank: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{abdcRanks.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Impact Factor</Label>
                  <Input value={editForm.impact_factor} onChange={e => setEditForm((f: any) => ({ ...f, impact_factor: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditIc(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={saving || !editForm.title?.trim()}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default MyRepositoryPage;
