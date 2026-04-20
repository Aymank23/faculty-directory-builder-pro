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
import { Users, Pencil, Trash2, Search, RotateCcw, Columns3, AlertTriangle, Filter as FilterIcon } from 'lucide-react';
import { departments, campuses, academicRanks, ftPtStatuses, highestDegrees, facultyQualifications, facultySufficiencies, tenureStatuses } from '@/lib/constants';
import { normalizeNA, normalizeField, normalizeDepartment } from '@/lib/normalize';

/* ── Multi-select filter helper ───────────────────────── */
const MultiSelectFilter = ({ label, options, selected, onChange, width = 'w-44' }: {
  label: string; options: string[]; selected: Set<string>; onChange: (next: Set<string>) => void; width?: string;
}) => {
  const count = selected.size;
  const display = count === 0 ? label : count === 1 ? Array.from(selected)[0] : `${label} (${count})`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`${width} justify-between font-normal h-10`}>
          <span className="truncate text-sm">{display}</span>
          <FilterIcon className="h-3.5 w-3.5 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex justify-between items-center px-1 pb-2 border-b border-border mb-2">
          <span className="text-xs font-medium">{label}</span>
          {count > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => onChange(new Set())}>Clear</Button>
          )}
        </div>
        <ScrollArea className="max-h-64">
          <div className="space-y-1">
            {options.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3 text-center">No values</p>
            ) : options.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-xs">
                <Checkbox
                  checked={selected.has(opt)}
                  onCheckedChange={() => {
                    const next = new Set(selected);
                    if (next.has(opt)) next.delete(opt); else next.add(opt);
                    onChange(next);
                  }}
                  className="h-3.5 w-3.5"
                />
                <span className="text-foreground truncate">{opt}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
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
  { key: 'department', label: 'Department', pinned: true, defaultVisible: true, render: f => normalizeDepartment(f.department) === 'N/A' && !f.department ? '—' : normalizeDepartment(f.department) },
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

  // Filters — multi-select sets, derived from actual data
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set());
  const [campusFilter, setCampusFilter] = useState<Set<string>>(new Set());
  const [rankFilter, setRankFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [classFilter, setClassFilter] = useState<Set<string>>(new Set());
  const [suffFilter, setSuffFilter] = useState<Set<string>>(new Set());
  const [ftPtFilter, setFtPtFilter] = useState<Set<string>>(new Set());
  const [tenureFilter, setTenureFilter] = useState<Set<string>>(new Set());

  const { data: faculty = [] } = useQuery({
    queryKey: ['all-faculty'],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*').order('last_name');
      return data || [];
    },
  });

  // Derive distinct filter values from actual database content (trimmed, deduped, sorted).
  // Values flow through normalizeField() so that:
  //   - NA / N/A / n/a / na collapse into a single "N/A" option
  //   - department aliases (MKT, MGT, FINA, ITOM, …) collapse into their
  //     canonical labels — see src/lib/normalize.ts.
  const distinct = (key: string): string[] => {
    const set = new Set<string>();
    for (const f of faculty as any[]) {
      const v = f[key];
      if (v === null || v === undefined) continue;
      const raw = String(v).trim();
      if (!raw) continue;
      set.add(normalizeField(key, raw));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  };

  const deptOptions = useMemo(() => distinct('department'), [faculty]);
  const campusOptions = useMemo(() => distinct('campus'), [faculty]);
  const rankOptions = useMemo(() => distinct('academic_rank'), [faculty]);
  const ftPtOptions = useMemo(() => distinct('ft_pt_status'), [faculty]);
  const classOptions = useMemo(() => distinct('faculty_qualification'), [faculty]);
  const suffOptions = useMemo(() => distinct('faculty_sufficiency'), [faculty]);
  const tenureOptions = useMemo(() => distinct('tenure_status'), [faculty]);

  const matchSet = (set: Set<string>, value: any, field = '') => {
    if (set.size === 0) return true;
    const v = value === null || value === undefined || String(value).trim() === ''
      ? ''
      : normalizeField(field, value);
    return set.has(v);
  };

  const filtered = faculty.filter((f: any) => {
    if (search) {
      const s = search.toLowerCase();
      const name = `${f.first_name || ''} ${f.middle_names || ''} ${f.last_name || ''}`.toLowerCase();
      if (
        !name.includes(s) &&
        !(f.employee_id || '').toString().toLowerCase().includes(s) &&
        !(f.email || '').toLowerCase().includes(s)
      ) return false;
    }
    if (!matchSet(deptFilter, f.department, 'department')) return false;
    if (!matchSet(campusFilter, f.campus, 'campus')) return false;
    if (!matchSet(rankFilter, f.academic_rank, 'academic_rank')) return false;
    if (!matchSet(ftPtFilter, f.ft_pt_status, 'ft_pt_status')) return false;
    if (!matchSet(classFilter, f.faculty_qualification, 'faculty_qualification')) return false;
    if (!matchSet(suffFilter, f.faculty_sufficiency, 'faculty_sufficiency')) return false;
    if (!matchSet(tenureFilter, f.tenure_status, 'tenure_status')) return false;
    return true;
  });

  const resetFilters = () => {
    setSearch('');
    setDeptFilter(new Set());
    setCampusFilter(new Set());
    setRankFilter(new Set());
    setFtPtFilter(new Set());
    setClassFilter(new Set());
    setSuffFilter(new Set());
    setTenureFilter(new Set());
  };

  const hasFilters = !!search || deptFilter.size > 0 || campusFilter.size > 0 || rankFilter.size > 0 ||
    ftPtFilter.size > 0 || classFilter.size > 0 || suffFilter.size > 0 || tenureFilter.size > 0;

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

        {/* Filter Bar — derived from actual data values */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search Employee ID, Name, Email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <MultiSelectFilter label="Department" options={deptOptions} selected={deptFilter} onChange={setDeptFilter} width="w-44" />
          <MultiSelectFilter label="Campus" options={campusOptions} selected={campusFilter} onChange={setCampusFilter} width="w-36" />
          <MultiSelectFilter label="Rank" options={rankOptions} selected={rankFilter} onChange={setRankFilter} width="w-44" />
          <MultiSelectFilter label="FT/PT" options={ftPtOptions} selected={ftPtFilter} onChange={setFtPtFilter} width="w-32" />
          <MultiSelectFilter label="Classification" options={classOptions} selected={classFilter} onChange={setClassFilter} width="w-40" />
          <MultiSelectFilter label="Participation" options={suffOptions} selected={suffFilter} onChange={setSuffFilter} width="w-40" />
          <MultiSelectFilter label="Tenure" options={tenureOptions} selected={tenureFilter} onChange={setTenureFilter} width="w-40" />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-10">
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
