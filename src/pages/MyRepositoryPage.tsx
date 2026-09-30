import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Library, Search, Eye, Pencil, FileText, ExternalLink, Trash2, FileSpreadsheet, RotateCcw, Upload, PlusCircle } from 'lucide-react';
import { quartiles } from '@/lib/constants';
import { toast } from 'sonner';
import { getEvidenceUrl } from '@/lib/evidence';
import * as XLSX from 'xlsx';
import { fetchFacultyCanonical, SHARED_FIELDS } from '@/lib/canonicalData';
import { HISTORICAL_TYPES, PORTFOLIOS, confirmedAuthors, deriveTable81Type, normalizePortfolio } from '@/lib/table81';
import { VERIFICATION_STATUS_LABELS } from '@/lib/icTaxonomy';
import { saveCanonicalEdit, uploadCanonicalEvidence, withdrawProposedLink, friendlyWriteError } from '@/lib/canonicalWrite';

const STATUSES = ['under_review', 'verified', 'excluded'] as const;
const LINK_LABEL: Record<string, string> = { confirmed: 'Confirmed author', proposed: 'Awaiting admin confirmation' };
const FIELD_LABELS: Record<string, string> = {
  title: 'Title', year: 'Year', journal_outlet: 'Journal / Outlet', doi: 'DOI', authors: 'Authors (as published)',
  total_authors: 'Total Authors', quartile: 'Quartile', scholarship_portfolio: 'Scholarship Portfolio',
  historical_reporting_type: 'AKSOB Reporting Type', apa_citation: 'Citation',
};

const MyRepositoryPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || 'all');
  const [quartileFilter, setQuartileFilter] = useState(searchParams.get('quartile') || 'all');
  const [portfolioFilter, setPortfolioFilter] = useState(searchParams.get('portfolio') || 'all');
  const [yearFilter, setYearFilter] = useState(searchParams.get('year') || 'all');
  const [viewIc, setViewIc] = useState<any>(null);
  const [editIc, setEditIc] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const next: Record<string, string> = {};
    if (statusFilter !== 'all') next.status = statusFilter;
    if (typeFilter !== 'all') next.type = typeFilter;
    if (quartileFilter !== 'all') next.quartile = quartileFilter;
    if (portfolioFilter !== 'all') next.portfolio = portfolioFilter;
    if (yearFilter !== 'all') next.year = yearFilter;
    setSearchParams(next, { replace: true });
  }, [statusFilter, typeFilter, quartileFilter, portfolioFilter, yearFilter, setSearchParams]);

  const resetFilters = () => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); setQuartileFilter('all'); setPortfolioFilter('all'); setYearFilter('all'); };

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*').eq('user_id', user!.id)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data } = useQuery({
    queryKey: ['v2-faculty-ics', profile?.faculty_id],
    queryFn: () => fetchFacultyCanonical(profile!.faculty_id),
    enabled: !!profile,
  });
  const ics = data?.ics || [];
  const authors = data?.authors || [];
  const myLink = (icId: string) => authors.find((a) => a.canonical_ic_id === icId && a.faculty_id === profile?.faculty_id);

  // Older records not yet brought into the shared model (school-wide migration pending). Read-only, never counted.
  const { data: pendingLegacy = [] } = useQuery({
    queryKey: ['legacy-unmigrated', profile?.faculty_id],
    queryFn: async () => {
      const { data: rows } = await supabase.from('intellectual_contributions').select('ic_id,title,year,journal_outlet')
        .eq('faculty_id', profile!.faculty_id).eq('record_class', 'ic');
      if (!rows?.length) return [];
      const { data: links } = await supabase.from('legacy_ic_link').select('legacy_ic_id').in('legacy_ic_id', rows.map((r) => r.ic_id));
      const linked = new Set((links || []).map((l: any) => l.legacy_ic_id));
      return rows.filter((r) => !linked.has(r.ic_id));
    },
    enabled: !!profile,
  });

  const yearOptions = useMemo(() => [...new Set(ics.map((i) => i.year).filter(Boolean) as number[])].sort((a, b) => b - a), [ics]);

  const filtered = ics.filter((ic) => {
    const q = search.toLowerCase();
    return (!q || (ic.title || '').toLowerCase().includes(q) || (ic.authors || '').toLowerCase().includes(q))
      && (statusFilter === 'all' || ic.verification_status === statusFilter)
      && (typeFilter === 'all' || ic.historical_reporting_type === typeFilter)
      && (quartileFilter === 'all' || ic.quartile === quartileFilter)
      && (portfolioFilter === 'all' || normalizePortfolio(ic.scholarship_portfolio) === portfolioFilter)
      && (yearFilter === 'all' || String(ic.year) === yearFilter);
  });

  const isShared = (id: string) => confirmedAuthors(authors, id).length > 1;

  const openEdit = (ic: any) => {
    setEditIc(ic);
    const f: Record<string, string> = {};
    SHARED_FIELDS.forEach((k) => (f[k] = ic[k] == null ? '' : String(ic[k])));
    setForm(f); setReason('');
  };

  const handleSaveEdit = async () => {
    if (!editIc || !form.title?.trim()) return;
    setSaving(true);
    const payload: Record<string, any> = {};
    SHARED_FIELDS.forEach((k) => {
      const v = form[k]?.trim() || null;
      payload[k] = (k === 'year' || k === 'total_authors') && v ? Number.parseInt(v, 10) : v;
    });
    try {
      const r = await saveCanonicalEdit({ ic: editIc, payload, authors, isAdmin, userId: user!.id, reason });
      if (r === 'proposed') toast.success('Shared publication — change sent to admin for approval');
      else if (r === 'applied') toast.success('Saved' + (editIc.verification_status === 'verified' ? ' — returned to Under Review' : ''));
      setEditIc(null);
      qc.invalidateQueries();
    } catch (e) { toast.error(friendlyWriteError(e)); }
    setSaving(false);
  };

  const handleWithdraw = async (ic: any) => {
    const link = myLink(ic.id);
    if (!link?.id || link.link_status !== 'proposed') return;
    if (!confirm(`Remove yourself from "${ic.title}"? The publication record itself is kept for audit.`)) return;
    try {
      await withdrawProposedLink(link.id);
      await supabase.from('audit_log').insert({ user_id: user!.id, action: 'canonical_author_link_withdrawn', target_table: 'canonical_ics', target_record: ic.id, details: { title: ic.title } });
      toast.success('Removed from your repository');
      qc.invalidateQueries();
    } catch (e) { toast.error(friendlyWriteError(e)); }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uploadFor || !profile) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('File must be under 10 MB'); return; }
    try { await uploadCanonicalEvidence(profile.faculty_id, uploadFor, file); toast.success('Evidence uploaded'); qc.invalidateQueries(); }
    catch (err) { toast.error(friendlyWriteError(err)); }
    setUploadFor(null);
  };

  const handleExport = () => {
    const rows = filtered.map((ic) => ({
      Title: ic.title, Year: ic.year || '', 'Journal/Outlet': ic.journal_outlet || '', Authors: ic.authors || '', DOI: ic.doi || '',
      'AKSOB Reporting Type': ic.historical_reporting_type || '', 'Table 8.1 Type': deriveTable81Type(ic.historical_reporting_type) || '',
      'Scholarship Portfolio': normalizePortfolio(ic.scholarship_portfolio) || '', Quartile: ic.quartile || '',
      'Verification Status': VERIFICATION_STATUS_LABELS[(ic.verification_status as 'verified') || 'under_review'],
      'My Author Link': LINK_LABEL[myLink(ic.id)?.link_status || ''] || '', 'Original CV Item Type': ic.original_cv_item_type || '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'My ICs');
    XLSX.writeFile(wb, `My_ICs_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const fsel = (value: string, set: (v: string) => void, all: string, opts: readonly string[], w: string, labels?: Record<string, string>) => (
    <Select value={value} onValueChange={set}>
      <SelectTrigger className={w}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{all}</SelectItem>
        {opts.map((o) => <SelectItem key={o} value={o}>{labels?.[o] || o}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">My Repository</h1>
            <p className="text-sm text-muted-foreground">Your intellectual contributions — the same records used in Table 8.1</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link to="/add-contribution"><PlusCircle className="h-4 w-4 mr-2" />Add</Link></Button>
            <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}><FileSpreadsheet className="h-4 w-4 mr-2" /> Export</Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search title or authors…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {fsel(statusFilter, setStatusFilter, 'All Statuses', STATUSES, 'w-36', VERIFICATION_STATUS_LABELS as any)}
          {fsel(typeFilter, setTypeFilter, 'All Types', HISTORICAL_TYPES, 'w-52')}
          {fsel(quartileFilter, setQuartileFilter, 'All Quartiles', quartiles, 'w-32')}
          {fsel(portfolioFilter, setPortfolioFilter, 'All Portfolios', PORTFOLIOS, 'w-48')}
          {fsel(yearFilter, setYearFilter, 'All Years', yearOptions.map(String), 'w-28')}
          <Button variant="ghost" size="sm" onClick={resetFilters}><RotateCcw className="h-4 w-4 mr-1" /> Reset</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Library className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {ics.length === 0 ? 'No intellectual contributions yet. Use "Add" to submit your first entry.' : 'No results match your current filters.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead><TableHead>Reporting Type</TableHead><TableHead>Portfolio</TableHead>
                      <TableHead>Quartile</TableHead><TableHead>Year</TableHead><TableHead>Proof</TableHead>
                      <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((ic) => {
                      const link = myLink(ic.id);
                      return (
                        <TableRow key={ic.id}>
                          <TableCell className="font-medium max-w-xs">
                            <div className="truncate">{ic.title}</div>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {isShared(ic.id) && <Badge variant="outline" className="text-[10px]">Shared</Badge>}
                              {link && <Badge variant={link.link_status === 'confirmed' ? 'secondary' : 'outline'} className="text-[10px]">{LINK_LABEL[link.link_status]}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{ic.historical_reporting_type || '—'}</TableCell>
                          <TableCell className="text-sm">{normalizePortfolio(ic.scholarship_portfolio) || '—'}</TableCell>
                          <TableCell>{ic.quartile || '—'}</TableCell>
                          <TableCell>{ic.year || '—'}</TableCell>
                          <TableCell><Badge variant={ic.evidence_file_url ? 'default' : 'outline'} className="text-xs">{ic.evidence_file_url ? 'Uploaded' : 'Missing'}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={ic.verification_status === 'verified' ? 'default' : ic.verification_status === 'excluded' ? 'destructive' : 'secondary'} className="text-xs">
                              {VERIFICATION_STATUS_LABELS[(ic.verification_status as 'verified') || 'under_review']}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" aria-label="View" onClick={() => setViewIc(ic)}><Eye className="h-3.5 w-3.5" /></Button>
                              {ic.evidence_file_url ? (
                                <Button variant="ghost" size="sm" aria-label="Open evidence" onClick={async () => window.open(await getEvidenceUrl(ic.evidence_file_url!), '_blank')}><FileText className="h-3.5 w-3.5" /></Button>
                              ) : (
                                <Button variant="ghost" size="sm" aria-label="Upload evidence" onClick={() => { setUploadFor(ic.id); fileRef.current?.click(); }}><Upload className="h-3.5 w-3.5" /></Button>
                              )}
                              <Button variant="ghost" size="sm" aria-label="Edit" onClick={() => openEdit(ic)}><Pencil className="h-3.5 w-3.5" /></Button>
                              {link?.link_status === 'proposed' && (
                                <Button variant="ghost" size="sm" aria-label="Remove me" onClick={() => handleWithdraw(ic)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                              )}
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

        {pendingLegacy.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="font-serif text-base">Earlier records awaiting migration ({pendingLegacy.length})</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>These were recorded before the new review workflow. They are kept safely, are not counted anywhere yet, and will be brought in during the school-wide migration.</p>
              <ul className="list-disc pl-5 space-y-1">
                {pendingLegacy.slice(0, 50).map((r: any) => <li key={r.ic_id}>{r.title}{r.year ? ` (${r.year})` : ''}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}

        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" className="hidden" onChange={onFile} />

        <Dialog open={!!viewIc} onOpenChange={() => setViewIc(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="font-serif">{viewIc?.title}</DialogTitle></DialogHeader>
            {viewIc && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Reporting type:</span> {viewIc.historical_reporting_type || '—'}</div>
                  <div><span className="text-muted-foreground">Table 8.1 type:</span> {deriveTable81Type(viewIc.historical_reporting_type) || '—'}</div>
                  <div><span className="text-muted-foreground">Year:</span> {viewIc.year || '—'}</div>
                  <div><span className="text-muted-foreground">Quartile:</span> {viewIc.quartile || '—'}</div>
                  <div><span className="text-muted-foreground">Portfolio:</span> {normalizePortfolio(viewIc.scholarship_portfolio) || '—'}</div>
                  <div><span className="text-muted-foreground">Source:</span> {viewIc.original_cv_item_type || '—'}</div>
                </div>
                {viewIc.authors && <div><span className="text-muted-foreground">Authors:</span> {viewIc.authors}</div>}
                {viewIc.journal_outlet && <div><span className="text-muted-foreground">Journal:</span> {viewIc.journal_outlet}</div>}
                {viewIc.apa_citation && <div><span className="text-muted-foreground">Citation:</span><p className="mt-1 text-xs bg-muted p-2 rounded">{viewIc.apa_citation}</p></div>}
                {viewIc.doi && (
                  <a href={viewIc.doi.startsWith('http') ? viewIc.doi : `https://doi.org/${viewIc.doi}`} target="_blank" rel="noopener noreferrer" className="text-primary underline flex items-center gap-1">
                    {viewIc.doi} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {viewIc.rejection_reason && <div className="bg-destructive/10 text-destructive p-2 rounded text-xs"><strong>Reviewer note:</strong> {viewIc.rejection_reason}</div>}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!editIc} onOpenChange={() => setEditIc(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-serif">Edit Contribution</DialogTitle></DialogHeader>
            {editIc && isShared(editIc.id) && !isAdmin && (
              <p className="text-xs rounded-md bg-muted p-3 text-muted-foreground">This publication is shared with other AKSOB authors. Your changes are sent as a proposal and applied only after admin approval.</p>
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
              {editIc && isShared(editIc.id) && !isAdmin && (
                <div className="col-span-2 space-y-1.5"><Label>Reason for change</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditIc(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={saving || !form.title?.trim()}>{saving ? 'Saving…' : 'Save Changes'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default MyRepositoryPage;
