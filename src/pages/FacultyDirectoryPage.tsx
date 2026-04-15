import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Pencil, Trash2, Search, RotateCcw, Columns3, AlertTriangle } from 'lucide-react';
import { departments, campuses, academicRanks, ftPtStatuses, highestDegrees, facultyQualifications, facultySufficiencies, tenureStatuses } from '@/lib/constants';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

/* ── Column definitions ───────────────────────────────── */

interface ColumnDef {
  key: string;
  label: string;
  pinned?: boolean;
  defaultVisible: boolean;
  render: (f: any) => React.ReactNode;
}

const allColumns: ColumnDef[] = [
  { key: 'employee_id', label: 'Employee ID', pinned: true, defaultVisible: true, render: f => <span className="font-mono text-xs">{f.employee_id || '—'}</span> },
  { key: 'title', label: 'Title', defaultVisible: false, render: f => f.title || '—' },
  { key: 'name', label: 'Full Name', pinned: true, defaultVisible: true, render: f => <span className="font-medium whitespace-nowrap">{[f.first_name, f.middle_names, f.last_name].filter(Boolean).join(' ') || '—'}</span> },
  { key: 'email', label: 'Email', defaultVisible: true, render: f => <span className="text-xs">{f.email || '—'}</span> },
  { key: 'department', label: 'Department', pinned: true, defaultVisible: true, render: f => f.department || '—' },
  { key: 'campus', label: 'Campus', pinned: true, defaultVisible: true, render: f => f.campus || '—' },
  { key: 'academic_rank', label: 'Rank', pinned: true, defaultVisible: true, render: f => <span className="text-xs">{f.academic_rank || '—'}</span> },
  { key: 'admin_title', label: 'Admin Title', defaultVisible: false, render: f => <span className="text-xs">{f.admin_title || '—'}</span> },
  { key: 'ft_pt_status', label: 'FT/PT', defaultVisible: true, render: f => <Badge variant="outline" className="text-xs">{f.ft_pt_status || '—'}</Badge> },
  { key: 'faculty_qualification', label: 'Classification', pinned: true, defaultVisible: true, render: f => f.faculty_qualification ? <Badge variant="secondary" className="text-xs">{f.faculty_qualification}</Badge> : '—' },
  { key: 'faculty_sufficiency', label: 'Participation', pinned: true, defaultVisible: true, render: f => f.faculty_sufficiency ? <Badge variant={f.faculty_sufficiency === 'Participating' ? 'default' : 'outline'} className="text-xs">{f.faculty_sufficiency}</Badge> : '—' },
  { key: 'tenure_status', label: 'Tenure Status', defaultVisible: true, render: f => <span className="text-xs">{f.tenure_status || '—'}</span> },
  { key: 'highest_degree', label: 'Degree', defaultVisible: true, render: f => f.highest_degree || '—' },
  { key: 'highest_degree_date', label: 'Degree Date', defaultVisible: false, render: f => <span className="text-xs">{f.highest_degree_date || '—'}</span> },
  { key: 'degree_major', label: 'Major', defaultVisible: false, render: f => <span className="text-xs">{f.degree_major || '—'}</span> },
  { key: 'degree_institution', label: 'Institution', defaultVisible: false, render: f => <span className="text-xs max-w-[180px] truncate block">{f.degree_institution || '—'}</span> },
  { key: 'degree_country', label: 'Country', defaultVisible: false, render: f => <span className="text-xs">{f.degree_country || '—'}</span> },
  { key: 'date_joining_aksob', label: 'Hire Date', defaultVisible: false, render: f => <span className="text-xs">{f.date_joining_aksob || '—'}</span> },
  { key: 'discipline_program', label: 'Discipline', defaultVisible: false, render: f => <span className="text-xs">{f.discipline_program || '—'}</span> },
];

const DEFAULT_VISIBLE = new Set(allColumns.filter(c => c.defaultVisible).map(c => c.key));

/* ── Data completeness helpers ────────────────────────── */

const CORE_FIELDS = ['employee_id', 'first_name', 'last_name', 'department', 'campus', 'email', 'academic_rank', 'faculty_qualification', 'faculty_sufficiency'];

const computeCompleteness = (f: any) => {
  const filled = CORE_FIELDS.filter(k => f[k] && String(f[k]).trim()).length;
  return { filled, total: CORE_FIELDS.length, missing: CORE_FIELDS.filter(k => !f[k] || !String(f[k]).trim()) };
};

const FacultyDirectoryPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editFaculty, setEditFaculty] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(DEFAULT_VISIBLE);
  const [showInspection, setShowInspection] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [campusFilter, setCampusFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [suffFilter, setSuffFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: faculty = [] } = useQuery({
    queryKey: ['all-faculty'],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*').order('last_name');
      return data || [];
    },
  });

  const filtered = faculty.filter(f => {
    if (search) {
      const s = search.toLowerCase();
      const name = `${f.first_name} ${f.middle_names || ''} ${f.last_name}`.toLowerCase();
      if (!name.includes(s) && !(f.employee_id || '').toLowerCase().includes(s) && !(f.email || '').toLowerCase().includes(s)) return false;
    }
    if (deptFilter !== 'all' && f.department !== deptFilter) return false;
    if (campusFilter !== 'all' && f.campus !== campusFilter) return false;
    if (classFilter !== 'all' && f.faculty_qualification !== classFilter) return false;
    if (suffFilter !== 'all') {
      if (suffFilter === 'Participating' && f.faculty_sufficiency !== 'Participating') return false;
      if (suffFilter === 'Supporting' && f.faculty_sufficiency !== 'Supporting') return false;
    }
    if (statusFilter !== 'all' && f.ft_pt_status !== statusFilter) return false;
    return true;
  });

  const resetFilters = () => {
    setSearch(''); setDeptFilter('all'); setCampusFilter('all'); setClassFilter('all'); setSuffFilter('all'); setStatusFilter('all');
  };

  const hasFilters = search || deptFilter !== 'all' || campusFilter !== 'all' || classFilter !== 'all' || suffFilter !== 'all' || statusFilter !== 'all';

  const activeColumns = useMemo(() => allColumns.filter(c => visibleCols.has(c.key)), [visibleCols]);

  const toggleColumn = (key: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const resetColumns = () => setVisibleCols(new Set(DEFAULT_VISIBLE));
  const showAll = () => setVisibleCols(new Set(allColumns.map(c => c.key)));

  /* ── Completeness stats ────────────────────────────── */

  const completenessStats = useMemo(() => {
    if (faculty.length === 0) return null;
    let complete = 0, partial = 0;
    const fieldMissing: Record<string, number> = {};
    for (const f of faculty) {
      const c = computeCompleteness(f);
      if (c.filled === c.total) complete++;
      else {
        partial++;
        c.missing.forEach(m => { fieldMissing[m] = (fieldMissing[m] || 0) + 1; });
      }
    }
    return { total: faculty.length, complete, partial, fieldMissing };
  }, [faculty]);

  /* ── Edit dialog ───────────────────────────────────── */

  const openEdit = (f: any) => {
    setEditFaculty(f);
    setEditForm({
      first_name: f.first_name || '', last_name: f.last_name || '', middle_names: f.middle_names || '',
      title: f.title || '', department: f.department || '',
      campus: f.campus || '', academic_rank: f.academic_rank || '', ft_pt_status: f.ft_pt_status || 'FT',
      highest_degree: f.highest_degree || '', highest_degree_date: f.highest_degree_date || '',
      date_joining_aksob: f.date_joining_aksob || '', employee_id: f.employee_id || '',
      discipline_program: f.discipline_program || '', email: f.email || '',
      faculty_qualification: f.faculty_qualification || '', faculty_sufficiency: f.faculty_sufficiency || '',
      tenure_status: f.tenure_status || '', admin_title: f.admin_title || '',
      degree_major: f.degree_major || '', degree_institution: f.degree_institution || '',
      degree_country: f.degree_country || '',
    });
  };

  const handleSave = async () => {
    if (!editFaculty) return;
    setSaving(true);
    const payload: Record<string, any> = {};
    for (const [key, val] of Object.entries(editForm)) {
      payload[key] = (val as string) || null;
    }
    const { error } = await supabase.from('faculty_profiles').update(payload).eq('faculty_id', editFaculty.faculty_id);
    if (error) { toast.error('Update failed'); setSaving(false); return; }
    await supabase.from('audit_log').insert({
      user_id: user!.id, action: 'faculty_profile_edited', target_record: editFaculty.faculty_id,
      target_table: 'faculty_profiles', details: { name: `${editForm.first_name} ${editForm.last_name}` },
    });
    toast.success('Profile updated');
    setEditFaculty(null);
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['all-faculty'] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from('academic_qualifications').delete().eq('faculty_id', deleteTarget.faculty_id);
    await supabase.from('professional_engagements').delete().eq('faculty_id', deleteTarget.faculty_id);
    await supabase.from('service_contributions').delete().eq('faculty_id', deleteTarget.faculty_id);
    await supabase.from('awards_recognition').delete().eq('faculty_id', deleteTarget.faculty_id);
    await supabase.from('intellectual_contributions').delete().eq('faculty_id', deleteTarget.faculty_id);
    await supabase.from('teaching_load').delete().eq('faculty_id', deleteTarget.faculty_id);
    const { error } = await supabase.from('faculty_profiles').delete().eq('faculty_id', deleteTarget.faculty_id);
    if (error) { toast.error('Delete failed: ' + error.message); setDeleting(false); return; }
    await supabase.from('audit_log').insert({
      user_id: user!.id, action: 'faculty_deleted', target_record: deleteTarget.faculty_id,
      target_table: 'faculty_profiles', details: { name: `${deleteTarget.first_name} ${deleteTarget.last_name}` },
    });
    toast.success('Faculty record deleted');
    setDeleteTarget(null);
    setDeleting(false);
    queryClient.invalidateQueries({ queryKey: ['all-faculty'] });
  };

  const handleClearAll = async () => {
    setClearingAll(true);
    try {
      await supabase.from('academic_qualifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('professional_engagements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('service_contributions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('awards_recognition').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('intellectual_contributions').delete().neq('ic_id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('teaching_load').delete().neq('teaching_id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('faculty_profiles').delete().neq('faculty_id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('audit_log').insert({
        user_id: user!.id, action: 'faculty_directory_cleared',
        target_table: 'faculty_profiles', details: { records_cleared: faculty.length },
      });
      toast.success(`Cleared ${faculty.length} faculty records`);
      queryClient.invalidateQueries({ queryKey: ['all-faculty'] });
    } catch (err: any) {
      toast.error('Clear failed: ' + err.message);
    }
    setClearingAll(false);
    setClearAllOpen(false);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">Faculty Directory</h1>
            <p className="text-sm text-muted-foreground">All faculty profiles — {filtered.length} of {faculty.length} shown</p>
          </div>
          <div className="flex gap-2 shrink-0">
            {faculty.length > 0 && (
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setClearAllOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear All
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowInspection(!showInspection)}>
              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Data Quality
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns3 className="h-3.5 w-3.5 mr-1" /> Columns ({activeColumns.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="end">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-foreground">Show / Hide Columns</span>
                  </div>
                  <ScrollArea className="h-64">
                    <div className="space-y-1">
                      {allColumns.map(col => (
                        <label key={col.key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer text-xs">
                          <Checkbox checked={visibleCols.has(col.key)} onCheckedChange={() => toggleColumn(col.key)} className="h-3.5 w-3.5" />
                          <span className="text-foreground">{col.label}</span>
                          {col.pinned && <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto">key</Badge>}
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="flex gap-2 pt-1 border-t border-border">
                    <Button variant="ghost" size="sm" className="text-xs flex-1 h-7" onClick={resetColumns}>Default</Button>
                    <Button variant="ghost" size="sm" className="text-xs flex-1 h-7" onClick={showAll}>Show All</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Data Quality / Completeness panel */}
        {showInspection && completenessStats && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-medium text-foreground">Data Quality Report</h3>
              <div className="flex flex-wrap gap-3 text-xs">
                <Badge variant="outline">{completenessStats.total} total records</Badge>
                <Badge variant="default">{completenessStats.complete} complete</Badge>
                {completenessStats.partial > 0 && (
                  <Badge variant="secondary" className="border-warning/40 text-warning">{completenessStats.partial} partial</Badge>
                )}
              </div>
              {Object.keys(completenessStats.fieldMissing).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Missing core fields:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(completenessStats.fieldMissing)
                      .sort(([, a], [, b]) => b - a)
                      .map(([field, count]) => (
                        <Badge key={field} variant="outline" className="text-[10px]">
                          {field.replace(/_/g, ' ')}: {count} missing
                        </Badge>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Filter Bar */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name, ID, email…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={campusFilter} onValueChange={setCampusFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Campus" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campuses</SelectItem>
              {campuses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Classification" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classifications</SelectItem>
              {facultyQualifications.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={suffFilter} onValueChange={setSuffFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Participation" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Participating">Participating</SelectItem>
              <SelectItem value="Supporting">Supporting</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28"><SelectValue placeholder="FT/PT" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {ftPtStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {faculty.length === 0 ? 'No faculty records available. Use the Import Center to upload faculty profiles.' : 'No results match your filters.'}
                </p>
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {activeColumns.map(col => (
                        <TableHead key={col.key} className="text-xs whitespace-nowrap">{col.label}</TableHead>
                      ))}
                      <TableHead className="text-right text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(f => {
                      const comp = computeCompleteness(f);
                      return (
                        <TableRow key={f.faculty_id} className={comp.missing.length > 3 ? 'bg-warning/5' : ''}>
                          {activeColumns.map(col => (
                            <TableCell key={col.key} className="text-sm">{col.render(f)}</TableCell>
                          ))}
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(f)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(f)} className="text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog — all fields */}
        <Dialog open={!!editFaculty} onOpenChange={() => setEditFaculty(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-serif">Edit Faculty Profile</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Title</Label><Input value={editForm.title} onChange={e => setEditForm((f: any) => ({ ...f, title: e.target.value }))} /></div>
                <div className="space-y-2"><Label>First Name</Label><Input value={editForm.first_name} onChange={e => setEditForm((f: any) => ({ ...f, first_name: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Last Name</Label><Input value={editForm.last_name} onChange={e => setEditForm((f: any) => ({ ...f, last_name: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Middle Names</Label><Input value={editForm.middle_names} onChange={e => setEditForm((f: any) => ({ ...f, middle_names: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Employee ID</Label><Input value={editForm.employee_id} onChange={e => setEditForm((f: any) => ({ ...f, employee_id: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Email</Label><Input value={editForm.email} onChange={e => setEditForm((f: any) => ({ ...f, email: e.target.value }))} /></div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select value={editForm.department} onValueChange={v => setEditForm((f: any) => ({ ...f, department: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Campus</Label>
                  <Select value={editForm.campus} onValueChange={v => setEditForm((f: any) => ({ ...f, campus: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{campuses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Academic Rank</Label>
                  <Select value={editForm.academic_rank} onValueChange={v => setEditForm((f: any) => ({ ...f, academic_rank: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{academicRanks.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Admin Title</Label><Input value={editForm.admin_title} onChange={e => setEditForm((f: any) => ({ ...f, admin_title: e.target.value }))} /></div>
                <div className="space-y-2">
                  <Label>AACSB Classification</Label>
                  <Select value={editForm.faculty_qualification} onValueChange={v => setEditForm((f: any) => ({ ...f, faculty_qualification: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{facultyQualifications.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Participation Status</Label>
                  <Select value={editForm.faculty_sufficiency} onValueChange={v => setEditForm((f: any) => ({ ...f, faculty_sufficiency: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{facultySufficiencies.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tenure Status</Label>
                  <Select value={editForm.tenure_status} onValueChange={v => setEditForm((f: any) => ({ ...f, tenure_status: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{tenureStatuses.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>FT/PT Status</Label>
                  <Select value={editForm.ft_pt_status} onValueChange={v => setEditForm((f: any) => ({ ...f, ft_pt_status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ftPtStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Highest Degree</Label>
                  <Select value={editForm.highest_degree} onValueChange={v => setEditForm((f: any) => ({ ...f, highest_degree: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{highestDegrees.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Date of Highest Degree</Label><Input type="date" value={editForm.highest_degree_date} onChange={e => setEditForm((f: any) => ({ ...f, highest_degree_date: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Date Joining AKSOB</Label><Input type="date" value={editForm.date_joining_aksob} onChange={e => setEditForm((f: any) => ({ ...f, date_joining_aksob: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Degree Major</Label><Input value={editForm.degree_major} onChange={e => setEditForm((f: any) => ({ ...f, degree_major: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Degree Institution</Label><Input value={editForm.degree_institution} onChange={e => setEditForm((f: any) => ({ ...f, degree_institution: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Degree Country</Label><Input value={editForm.degree_country} onChange={e => setEditForm((f: any) => ({ ...f, degree_country: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Discipline / Program</Label><Input value={editForm.discipline_program} onChange={e => setEditForm((f: any) => ({ ...f, discipline_program: e.target.value }))} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditFaculty(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleting}
          title="Delete Faculty Record"
          description={`Are you sure you want to delete ${deleteTarget?.first_name} ${deleteTarget?.last_name}? This will also remove all their contributions, teaching load, qualifications, and related records.`}
        />

        {/* Clear All Confirm */}
        <DeleteConfirmDialog
          open={clearAllOpen}
          onOpenChange={setClearAllOpen}
          onConfirm={handleClearAll}
          loading={clearingAll}
          title="Clear Entire Directory"
          description={`Are you sure you want to delete ALL ${faculty.length} faculty records? This will also remove all their contributions, teaching load, qualifications, and related records. This action cannot be undone.`}
        />
      </div>
    </AppLayout>
  );
};

export default FacultyDirectoryPage;
