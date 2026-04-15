import { useState, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { icCategories, icTypes, quartiles, abdcRanks, indexingDatabases } from '@/lib/constants';
import { PlusCircle, Upload, FileText, X } from 'lucide-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

const AddContributionPage = () => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const [form, setForm] = useState({
    title: '', apa_citation: '', authors: '', year: '', journal_outlet: '',
    ic_category: '', ic_type: '', indexing_database: '', quartile: '',
    abdc_rank: '', doi: '', impact_factor: '',
  });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { toast.error('File must be under 10 MB'); return; }
    if (!ALLOWED_TYPES.includes(file.type)) { toast.error('Only PDF, PNG, JPG, DOC, and DOCX files are accepted'); return; }
    setEvidenceFile(file);
  };

  const removeFile = () => {
    setEvidenceFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadEvidence = async (facultyId: string, icId: string): Promise<string | null> => {
    if (!evidenceFile) return null;
    setUploading(true);
    const ext = evidenceFile.name.split('.').pop();
    const filePath = `${facultyId}/${icId}.${ext}`;
    const { error } = await supabase.storage.from('evidence').upload(filePath, evidenceFile, { cacheControl: '3600', upsert: true });
    setUploading(false);
    if (error) { console.error('Upload error:', error); toast.error('Evidence upload failed'); return null; }
    return filePath;
  };

  const handleSave = async (submitForReview: boolean) => {
    if (!profile) { toast.error('Profile not found'); return; }
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (submitForReview && !evidenceFile) { toast.error('Evidence file is required to submit for review'); return; }

    setSaving(true);
    const status = submitForReview ? 'under_review' : 'draft';
    const { data: icData, error } = await supabase.from('intellectual_contributions').insert({
      faculty_id: profile.faculty_id,
      title: form.title.trim(),
      apa_citation: form.apa_citation || null,
      authors: form.authors || null,
      year: form.year ? parseInt(form.year) : null,
      journal_outlet: form.journal_outlet || null,
      ic_category: form.ic_category || null,
      ic_type: form.ic_type || null,
      indexing_database: form.indexing_database || null,
      quartile: form.quartile || null,
      abdc_rank: form.abdc_rank || null,
      doi: form.doi || null,
      impact_factor: form.impact_factor || null,
      status,
    } as any).select('ic_id').single();

    if (error || !icData) { toast.error('Failed to save contribution'); setSaving(false); return; }

    let evidenceUrl: string | null = null;
    if (evidenceFile) {
      evidenceUrl = await uploadEvidence(profile.faculty_id, icData.ic_id);
      if (evidenceUrl) {
        await supabase.from('intellectual_contributions').update({
          evidence_file_url: evidenceUrl,
          evidence_status: 'uploaded',
        }).eq('ic_id', icData.ic_id);
      }
    }

    await supabase.from('audit_log').insert({
      user_id: user!.id,
      action: submitForReview ? 'ic_submitted' : 'ic_drafted',
      target_record: icData.ic_id,
      target_table: 'intellectual_contributions',
      details: { title: form.title, status, has_evidence: !!evidenceUrl },
    });

    toast.success(submitForReview ? 'Contribution submitted for review' : 'Draft saved');
    setForm({ title: '', apa_citation: '', authors: '', year: '', journal_outlet: '', ic_category: '', ic_type: '', indexing_database: '', quartile: '', abdc_rank: '', doi: '', impact_factor: '' });
    removeFile();
    setSaving(false);
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">Add Intellectual Contribution</h1>
          <p className="text-sm text-muted-foreground">Submit a new research output or scholarly work</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-muted text-primary"><PlusCircle className="h-5 w-5" /></div>
              <CardTitle className="font-serif text-base">Contribution Details</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* General Information */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">General Information</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Publication title" />
                </div>
                <div className="space-y-2">
                  <Label>APA Citation</Label>
                  <Textarea value={form.apa_citation} onChange={e => set('apa_citation', e.target.value)} placeholder="Full APA citation" rows={3} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Authors</Label>
                    <Input value={form.authors} onChange={e => set('authors', e.target.value)} placeholder="Author names (faculty name highlighted)" />
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Input value={form.year} onChange={e => set('year', e.target.value)} placeholder="e.g. 2024" type="number" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Journal / Outlet</Label>
                    <Input value={form.journal_outlet} onChange={e => set('journal_outlet', e.target.value)} placeholder="Journal or publication outlet" />
                  </div>
                  <div className="space-y-2">
                    <Label>DOI or External Link</Label>
                    <Input value={form.doi} onChange={e => set('doi', e.target.value)} placeholder="e.g. 10.1000/xyz123" />
                  </div>
                </div>
              </div>
            </div>

            {/* Classification */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Classification</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>IC Type (Research Type)</Label>
                  <Select value={form.ic_type} onValueChange={v => set('ic_type', v)}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {icTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>IC Category (Nature of Contribution)</Label>
                  <Select value={form.ic_category} onValueChange={v => set('ic_category', v)}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {icCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Scopus / Indexing Rankings */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Scopus / Indexing Rankings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Indexing Database</Label>
                  <Select value={form.indexing_database} onValueChange={v => set('indexing_database', v)}>
                    <SelectTrigger><SelectValue placeholder="Select database" /></SelectTrigger>
                    <SelectContent>
                      {indexingDatabases.map(db => <SelectItem key={db} value={db}>{db}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Journal Quartile</Label>
                  <Select value={form.quartile} onValueChange={v => set('quartile', v)}>
                    <SelectTrigger><SelectValue placeholder="Select quartile" /></SelectTrigger>
                    <SelectContent>
                      {quartiles.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label>ABDC Rank</Label>
                  <Select value={form.abdc_rank} onValueChange={v => set('abdc_rank', v)}>
                    <SelectTrigger><SelectValue placeholder="Select rank" /></SelectTrigger>
                    <SelectContent>
                      {abdcRanks.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Impact Factor</Label>
                  <Input value={form.impact_factor} onChange={e => set('impact_factor', e.target.value)} placeholder="e.g. 3.45" />
                </div>
              </div>
            </div>

            {/* Evidence Upload */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Proof of Evidence</h3>
              <p className="text-xs text-muted-foreground mb-2">Upload acceptance letter, final publication, or certificate. Required for submission. (PDF, DOC, DOCX, PNG, JPG — max 10 MB)</p>
              {!evidenceFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors cursor-pointer"
                >
                  <Upload className="h-6 w-6" />
                  <span className="text-sm font-medium">Click to upload evidence</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{evidenceFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(evidenceFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={removeFile} className="shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" className="hidden" onChange={handleFileSelect} />
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving || uploading}>
                Save as Draft
              </Button>
              <Button onClick={() => handleSave(true)} disabled={saving || uploading}>
                {uploading ? 'Uploading…' : 'Submit for Review'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AddContributionPage;
