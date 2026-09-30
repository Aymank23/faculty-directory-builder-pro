import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { quartiles, abdcRanks, indexingDatabases } from '@/lib/constants';
import { HISTORICAL_TYPES, PORTFOLIOS } from '@/lib/table81';
import { findCanonicalMatches, submitCanonicalContribution, uploadCanonicalEvidence, friendlyWriteError, type CanonicalMatch } from '@/lib/canonicalWrite';
import DuplicateMatchDialog from '@/components/v2/DuplicateMatchDialog';
import { PlusCircle, Upload, FileText, X } from 'lucide-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const EMPTY = {
  title: '', apa_citation: '', authors: '', total_authors: '', year: '', journal_outlet: '', doi: '',
  historical_reporting_type: 'Needs Review', scholarship_portfolio: '', indexing_database: '', quartile: '', abdc_rank: '', impact_factor: '',
};

const AddContributionPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*').eq('user_id', user!.id)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const [form, setForm] = useState({ ...EMPTY });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<CanonicalMatch[]>([]);

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { toast.error('File must be under 10 MB'); return; }
    if (!ALLOWED_TYPES.includes(file.type)) { toast.error('Only PDF, PNG, JPG, DOC, and DOCX files are accepted'); return; }
    setEvidenceFile(file);
  };
  const removeFile = () => { setEvidenceFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const payload = () => ({
    ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v).trim()])),
    original_cv_item_type: 'Manual entry (Add Contribution)',
    source: 'add_contribution',
  });

  const finish = async (id: string, linked: boolean) => {
    if (evidenceFile && profile) {
      try { await uploadCanonicalEvidence(profile.faculty_id, id, evidenceFile); }
      catch (e) { toast.error('Saved, but evidence upload failed: ' + friendlyWriteError(e)); }
    }
    toast.success(linked
      ? 'Linked to the existing publication — an admin will confirm you as author.'
      : 'Submitted — Under Review. It counts in Table 8.1 only after verification.');
    setForm({ ...EMPTY }); removeFile(); setMatches([]);
    qc.invalidateQueries();
    navigate('/repository');
  };

  const create = async (confirmNotDuplicate: boolean) => {
    if (!profile) return;
    setSaving(true);
    try {
      const id = await submitCanonicalContribution({ facultyId: profile.faculty_id, payload: payload(), confirmNotDuplicate });
      await finish(id, false);
    } catch (e) { toast.error(friendlyWriteError(e)); }
    setSaving(false);
  };

  const link = async (matchId: string) => {
    if (!profile) return;
    setSaving(true);
    try {
      const id = await submitCanonicalContribution({ facultyId: profile.faculty_id, payload: payload(), linkTo: matchId });
      await finish(id, true);
    } catch (e) { toast.error(friendlyWriteError(e)); }
    setSaving(false);
  };

  const handleSubmit = async () => {
    if (!profile) { toast.error('Profile not found'); return; }
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const found = await findCanonicalMatches(form.doi.trim() || null, form.title.trim(), form.year ? parseInt(form.year) : null);
      if (found.length) { setMatches(found); setSaving(false); return; }
    } catch (e) { toast.error(friendlyWriteError(e)); setSaving(false); return; }
    setSaving(false);
    if (!evidenceFile) { toast.error('Evidence file is required for a new contribution'); return; }
    await create(false);
  };

  const sel = (field: keyof typeof EMPTY, options: readonly string[], placeholder: string) => (
    <Select value={form[field]} onValueChange={v => set(field, v)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">Add Intellectual Contribution</h1>
          <p className="text-sm text-muted-foreground">New entries start Under Review and count in Table 8.1 only after verification.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-muted text-primary"><PlusCircle className="h-5 w-5" /></div>
              <CardTitle className="font-serif text-base">Contribution Details</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">General Information</h3>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Publication title only" /></div>
                <div className="space-y-2"><Label>APA Citation</Label><Textarea value={form.apa_citation} onChange={e => set('apa_citation', e.target.value)} placeholder="Full APA citation" rows={3} /></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-2"><Label>Authors (as published)</Label><Input value={form.authors} onChange={e => set('authors', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Total Authors</Label><Input type="number" value={form.total_authors} onChange={e => set('total_authors', e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Year</Label><Input type="number" value={form.year} onChange={e => set('year', e.target.value)} placeholder="e.g. 2025" /></div>
                  <div className="space-y-2 md:col-span-2"><Label>Journal / Outlet</Label><Input value={form.journal_outlet} onChange={e => set('journal_outlet', e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>DOI or External Link</Label><Input value={form.doi} onChange={e => set('doi', e.target.value)} placeholder="e.g. 10.1000/xyz123" /></div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Classification</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>AKSOB Reporting Type</Label>{sel('historical_reporting_type', HISTORICAL_TYPES, 'Select type')}</div>
                <div className="space-y-2"><Label>Scholarship Portfolio</Label>{sel('scholarship_portfolio', PORTFOLIOS, 'Select portfolio')}</div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">The Table 8.1 type is derived automatically from the reporting type.</p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Scopus / Indexing Rankings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Indexing Database</Label>{sel('indexing_database', indexingDatabases, 'Select database')}</div>
                <div className="space-y-2"><Label>Journal Quartile</Label>{sel('quartile', quartiles, 'Select quartile')}</div>
                <div className="space-y-2"><Label>ABDC Rank</Label>{sel('abdc_rank', abdcRanks, 'Select rank')}</div>
                <div className="space-y-2"><Label>Impact Factor</Label><Input value={form.impact_factor} onChange={e => set('impact_factor', e.target.value)} placeholder="e.g. 3.45" /></div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Proof of Evidence</h3>
              <p className="text-xs text-muted-foreground mb-2">Acceptance letter, final publication, or certificate. Required for a new contribution. (PDF, DOC, DOCX, PNG, JPG — max 10 MB)</p>
              {!evidenceFile ? (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer">
                  <Upload className="h-6 w-6" /><span className="text-sm font-medium">Click to upload evidence</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{evidenceFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(evidenceFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={removeFile} className="shrink-0" aria-label="Remove file"><X className="h-4 w-4" /></Button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" className="hidden" onChange={handleFileSelect} />
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Submit for Review'}</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <DuplicateMatchDialog
        open={matches.length > 0} matches={matches} busy={saving}
        onCancel={() => setMatches([])}
        onLink={link}
        onCreateNew={() => {
          if (!evidenceFile) { toast.error('Evidence file is required for a new contribution'); return; }
          create(true);
        }}
      />
    </AppLayout>
  );
};

export default AddContributionPage;
