import { useState, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Upload, FileText, Loader2, Check, X, AlertTriangle, Pencil, Trash2,
  Eye, Save, RefreshCw, User, GraduationCap, BookOpen, Briefcase, Award, Shield,
  CheckCircle, ArrowRight, Info
} from 'lucide-react';
import { icTypes, icCategories, quartiles } from '@/lib/constants';
import * as XLSX from 'xlsx';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExtractedIC {
  title: string;
  authors?: string;
  year?: number;
  journal_outlet?: string;
  ic_type?: string;
  ic_category?: string;
  quartile?: string;
  doi?: string;
  apa_citation?: string;
  confidence?: string;
  source_section?: string;
  raw_text?: string;
  // UI state
  _selected?: boolean;
  _editing?: boolean;
  _status?: 'new' | 'matched' | 'updated' | 'needs_review' | 'rejected';
  _matchedIcId?: string; // If matched to existing IC
}

interface PersonalInfo {
  first_name?: string;
  last_name?: string;
  department?: string;
  campus?: string;
  academic_rank?: string;
  employee_id?: string;
  ft_pt_status?: string;
  highest_degree?: string;
  highest_degree_date?: string;
  date_joining_aksob?: string;
}

interface Qualification {
  degree_certification: string;
  institution?: string;
  year?: string;
  field_area?: string;
  source_section?: string;
}

interface Engagement {
  from_to?: string;
  activity: string;
  details?: string;
  source_section?: string;
}

interface Service {
  from_to?: string;
  level?: string;
  committee_role: string;
  source_section?: string;
}

interface AwardEntry {
  year?: number;
  award: string;
  institution_organization?: string;
  source_section?: string;
}

interface ProfessionalExp {
  period?: string;
  organization: string;
  position_title?: string;
  key_responsibilities?: string;
  source_section?: string;
}

interface ExtractedData {
  cv_type?: string;
  personal_info?: PersonalInfo;
  qualifications: Qualification[];
  intellectual_contributions: ExtractedIC[];
  engagements: Engagement[];
  services: Service[];
  awards: AwardEntry[];
  professional_experience?: ProfessionalExp[];
}

interface ParseCvResponse {
  ok: boolean;
  data?: ExtractedData;
  warnings?: string[];
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeDoi(doi?: string | null): string | null {
  if (!doi) return null;
  return doi.replace(/^https?:\/\/doi\.org\//, '').replace(/^doi:/, '').trim().toLowerCase();
}

function normalizeTitle(t?: string | null): string {
  if (!t) return '';
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wordsA = new Set(na.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(nb.split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  wordsA.forEach(w => { if (wordsB.has(w)) overlap++; });
  return (2 * overlap) / (wordsA.size + wordsB.size);
}

// ─── Component ───────────────────────────────────────────────────────────────

const UploadCvPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // State
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [rawText, setRawText] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingIcIdx, setEditingIcIdx] = useState<number | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileEdits, setProfileEdits] = useState<PersonalInfo>({});
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload');
  const [saveResult, setSaveResult] = useState<any>(null);
  const [enableAiParsing, setEnableAiParsing] = useState(false);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [progressStage, setProgressStage] = useState<'idle' | 'upload' | 'parse' | 'extract' | 'preview' | 'save'>('idle');

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: existingIcs = [] } = useQuery({
    queryKey: ['my-ics-for-dedup', profile?.faculty_id],
    queryFn: async () => {
      const { data } = await supabase.from('intellectual_contributions').select('*').eq('faculty_id', profile!.faculty_id);
      return data || [];
    },
    enabled: !!profile,
  });

  const { data: existingQuals = [] } = useQuery({
    queryKey: ['my-quals', profile?.faculty_id],
    queryFn: async () => {
      const { data } = await supabase.from('academic_qualifications').select('*').eq('faculty_id', profile!.faculty_id);
      return data || [];
    },
    enabled: !!profile,
  });

  const extractText = async (f: File): Promise<string> => {
    if (f.name.endsWith('.txt') || f.name.endsWith('.csv')) return await f.text();
    if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      return wb.SheetNames.map(name => `--- ${name} ---\n` + XLSX.utils.sheet_to_csv(wb.Sheets[name])).join('\n\n');
    }
    if (f.name.endsWith('.docx') || f.name.endsWith('.doc')) {
      const arrayBuf = await f.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);
      const { data, error } = await supabase.functions.invoke('parse-docx', {
        body: { fileData: base64, fileName: f.name },
      });
      if (error) throw new Error('Failed to parse DOCX file');
      if (data?.error) throw new Error(data.error);
      const text = data?.text || '';
      if (text.length < 50) throw new Error('Could not extract sufficient text from the DOCX file.');
      return text;
    }
    return await f.text();
  };

  const deduplicateIcs = useCallback((newIcs: ExtractedIC[]): ExtractedIC[] => {
    return newIcs.map(ic => {
      const newDoi = normalizeDoi(ic.doi);
      if (newDoi) {
        const doiMatch = existingIcs.find((e: any) => normalizeDoi(e.doi) === newDoi);
        if (doiMatch) {
          return { ...ic, _selected: true, _status: 'matched' as const, _matchedIcId: doiMatch.ic_id };
        }
      }
      const newNorm = normalizeTitle(ic.title || ic.apa_citation);
      const titleYearMatch = existingIcs.find((e: any) => {
        const existNorm = normalizeTitle(e.title || e.apa_citation);
        return existNorm === newNorm && e.year === ic.year;
      });
      if (titleYearMatch) {
        return { ...ic, _selected: true, _status: 'matched' as const, _matchedIcId: titleYearMatch.ic_id };
      }
      const fuzzyMatch = existingIcs.find((e: any) => {
        const sim = titleSimilarity(ic.title || ic.apa_citation || '', e.title || e.apa_citation || '');
        return sim > 0.7;
      });
      if (fuzzyMatch) {
        return { ...ic, _selected: true, _status: 'needs_review' as const, _matchedIcId: fuzzyMatch.ic_id };
      }
      return {
        ...ic,
        _selected: true,
        _status: (ic.confidence === 'low' ? 'needs_review' : 'new') as 'new' | 'needs_review',
      };
    });
  }, [existingIcs]);

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    try {
      setProgressStage('upload');
      const cvText = await extractText(file);
      setRawText(cvText);
      if (cvText.trim().length < 20) {
        toast.error('Could not extract enough text from the file.');
        setExtracting(false);
        return;
      }
      setProgressStage('parse');
      const { data, error } = await supabase.functions.invoke('parse-cv', { body: { cvText, enableAiParsing } });
      if (error) throw error;
      const parsed = data as ParseCvResponse;
      if (parsed?.error) throw new Error(parsed.error);
      if (!parsed?.ok || !parsed.data) throw new Error('The CV parser returned an invalid response.');
      setProgressStage('extract');
      const nextData = parsed.data;
      if (nextData.intellectual_contributions) {
        nextData.intellectual_contributions = deduplicateIcs(nextData.intellectual_contributions);
      }
      if (nextData.personal_info) {
        setProfileEdits(nextData.personal_info);
      }
      setParseWarnings(parsed.warnings || []);
      setExtracted(nextData);
      setProgressStage('preview');
      setStep('review');
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse CV');
      setProgressStage('idle');
    }
    setExtracting(false);
  };

  const toggleIc = (idx: number) => {
    if (!extracted) return;
    const updated = [...extracted.intellectual_contributions];
    updated[idx] = { ...updated[idx], _selected: !updated[idx]._selected };
    setExtracted({ ...extracted, intellectual_contributions: updated });
  };

  const updateIc = (idx: number, field: string, value: any) => {
    if (!extracted) return;
    const updated = [...extracted.intellectual_contributions];
    updated[idx] = { ...updated[idx], [field]: value };
    setExtracted({ ...extracted, intellectual_contributions: updated });
  };

  const removeIc = (idx: number) => {
    if (!extracted) return;
    const updated = extracted.intellectual_contributions.filter((_, i) => i !== idx);
    setExtracted({ ...extracted, intellectual_contributions: updated });
  };

  const handleSave = async () => {
    if (!extracted || !profile) return;
    setSaving(true);
    setProgressStage('save');
    const facultyId = profile.faculty_id;
    const result = { profileUpdated: 0, icsInserted: 0, icsUpdated: 0, icsSkipped: 0, qualAdded: 0, engAdded: 0, svcAdded: 0, awardAdded: 0, profExpAdded: 0 };
    try {
      if (extracted.personal_info) {
        const updates: any = {};
        const pi = profileEdits;
        const profileFieldMap: Record<string, string> = {
          first_name: 'first_name', last_name: 'last_name', department: 'department',
          campus: 'campus', academic_rank: 'academic_rank', employee_id: 'employee_id',
          ft_pt_status: 'ft_pt_status', highest_degree: 'highest_degree',
          highest_degree_date: 'highest_degree_date', date_joining_aksob: 'date_joining_aksob',
        };
        for (const [extractedKey, dbKey] of Object.entries(profileFieldMap)) {
          const newVal = (pi as any)[extractedKey];
          const oldVal = (profile as any)[dbKey];
          if (newVal && newVal.trim() !== '' && newVal !== oldVal) {
            updates[dbKey] = newVal;
          }
        }
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          await supabase.from('faculty_profiles').update(updates).eq('faculty_id', facultyId);
          result.profileUpdated = Object.keys(updates).length - 1;
        }
      }
      const selectedIcs = extracted.intellectual_contributions.filter(ic => ic._selected);
      for (const ic of selectedIcs) {
        const icData = {
          faculty_id: facultyId,
          title: ic.title,
          authors: ic.authors || null,
          year: ic.year || null,
          journal_outlet: ic.journal_outlet || null,
          ic_type: ic.ic_type || null,
          ic_category: ic.ic_category || null,
          quartile: ic.quartile || null,
          doi: ic.doi || null,
          apa_citation: ic.apa_citation || null,
          status: ic.confidence === 'low' ? 'draft' : 'under_review',
          updated_at: new Date().toISOString(),
        };
        if (ic._matchedIcId && (ic._status === 'matched' || ic._status === 'updated' || ic._status === 'needs_review')) {
          const updateFields: any = {};
          for (const [k, v] of Object.entries(icData)) {
            if (v != null && k !== 'faculty_id' && k !== 'status') {
              updateFields[k] = v;
            }
          }
          if (Object.keys(updateFields).length > 0) {
            await supabase.from('intellectual_contributions').update(updateFields).eq('ic_id', ic._matchedIcId);
            result.icsUpdated++;
          } else {
            result.icsSkipped++;
          }
        } else if (ic._status === 'new') {
          await supabase.from('intellectual_contributions').insert(icData);
          result.icsInserted++;
        }
      }
      const newQuals = (extracted.qualifications || []).filter(q => {
        return !existingQuals.some((eq: any) =>
          eq.degree_certification === q.degree_certification &&
          eq.institution === q.institution
        );
      });
      if (newQuals.length > 0) {
        await supabase.from('academic_qualifications').insert(
          newQuals.map(q => ({
            faculty_id: facultyId,
            degree_certification: q.degree_certification,
            institution: q.institution || null,
            year: q.year ? parseInt(q.year) || null : null,
            field_area: q.field_area || null,
          }))
        );
        result.qualAdded = newQuals.length;
      }
      if (extracted.engagements?.length) {
        await supabase.from('professional_engagements').insert(
          extracted.engagements.map(e => ({
            faculty_id: facultyId, from_to: e.from_to || null,
            activity: e.activity, details: e.details || null,
          }))
        );
        result.engAdded = extracted.engagements.length;
      }
      if (extracted.services?.length) {
        await supabase.from('service_contributions').insert(
          extracted.services.map(s => ({
            faculty_id: facultyId, from_to: s.from_to || null,
            level: s.level || null, committee_role: s.committee_role,
          }))
        );
        result.svcAdded = extracted.services.length;
      }
      if (extracted.awards?.length) {
        await supabase.from('awards_recognition').insert(
          extracted.awards.map(a => ({
            faculty_id: facultyId, year: a.year || null,
            award: a.award, institution_organization: a.institution_organization || null,
          }))
        );
        result.awardAdded = extracted.awards.length;
      }
      if (extracted.professional_experience?.length) {
        await supabase.from('professional_experience').insert(
          extracted.professional_experience.map(p => ({
            faculty_id: facultyId, period: p.period || null,
            organization: p.organization, position_title: p.position_title || null,
            key_responsibilities: p.key_responsibilities || null,
          }))
        );
        result.profExpAdded = extracted.professional_experience.length;
      }
      await supabase.from('cv_uploads').insert({
        faculty_id: facultyId,
        user_id: user!.id,
        file_name: file?.name || 'unknown',
        parsing_timestamp: new Date().toISOString(),
        status: 'approved',
        ics_added: result.icsInserted,
        ics_updated: result.icsUpdated,
        ics_skipped: result.icsSkipped,
        profile_fields_updated: result.profileUpdated,
        changes_summary: result,
      });
      setSaveResult(result);
      setStep('done');
      queryClient.invalidateQueries();
      toast.success('CV data saved and propagated!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save CV data');
    }
    setSaving(false);
    setProgressStage('idle');
  };

  const icStats = extracted ? {
    total: extracted.intellectual_contributions.length,
    new: extracted.intellectual_contributions.filter(ic => ic._status === 'new').length,
    matched: extracted.intellectual_contributions.filter(ic => ic._status === 'matched').length,
    needsReview: extracted.intellectual_contributions.filter(ic => ic._status === 'needs_review').length,
    selected: extracted.intellectual_contributions.filter(ic => ic._selected).length,
  } : null;

  const lowQuality = extracted && icStats && (icStats.needsReview / Math.max(icStats.total, 1)) > 0.5;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">Upload CV</h1>
          <p className="text-sm text-muted-foreground">Upload your CV to auto-fill your profile, intellectual contributions, and all AACSB data</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {['Upload', 'Review & Edit', 'Complete'].map((label, i) => {
            const stepMap = ['upload', 'review', 'done'];
            const isActive = stepMap[i] === step;
            const isDone = stepMap.indexOf(step) > i;
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${isActive ? 'bg-primary text-primary-foreground' : isDone ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}>{label}</span>
                {i < 2 && <ArrowRight className="h-4 w-4 text-muted-foreground/40" />}
              </div>
            );
          })}
        </div>
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg flex items-center gap-2">
                <Upload className="h-5 w-5" /> Upload CV File
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Supported formats: .docx (recommended), .doc, .txt, .xlsx. AACSB CVs are parsed with rule-based extraction by default, with optional AI fallback.
              </p>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Enable AI parsing</p>
                  <p className="text-xs text-muted-foreground">Optional fallback only. Parsing works without credits when this is off.</p>
                </div>
                <Switch checked={enableAiParsing} onCheckedChange={setEnableAiParsing} />
              </div>
              {progressStage !== 'idle' && (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {['upload', 'parse', 'extract', 'preview'].map((stage) => (
                    <Badge key={stage} variant={progressStage === stage ? 'default' : progressStage === 'save' || ['upload', 'parse', 'extract', 'preview'].indexOf(progressStage) > ['upload', 'parse', 'extract', 'preview'].indexOf(stage) ? 'secondary' : 'outline'}>
                      {stage}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <input type="file" ref={fileRef} accept=".docx,.doc,.txt,.xlsx,.xls" onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { setFile(f); setExtracted(null); setRawText(''); setStep('upload'); }
                }} className="hidden" />
                <Button variant="outline" onClick={() => fileRef.current?.click()} size="lg">
                  <Upload className="h-4 w-4 mr-2" /> Select CV File
                </Button>
                {file && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span className="truncate max-w-64">{file.name}</span>
                    <Badge variant="outline" className="text-[10px]">{(file.size / 1024).toFixed(0)} KB</Badge>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setFile(null); setExtracted(null); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              {existingIcs.length > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>You have {existingIcs.length} existing ICs. Re-uploading will update matches and add new entries — no duplication.</span>
                </div>
              )}
              {file && (
                <Button onClick={handleExtract} disabled={extracting} className="w-full" size="lg">
                  {extracting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Extracting & Parsing CV…</> : 'Parse CV'}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
        {step === 'review' && extracted && (
          <>
            {lowQuality && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="py-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Low Parsing Quality Detected</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      More than half of the extracted items have low confidence. Please review carefully before saving.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            {parseWarnings.length > 0 && (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardContent className="py-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">Parsing warnings</p>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                    {parseWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </CardContent>
              </Card>
            )}
            {icStats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Total ICs</div>
                  <div className="text-2xl font-bold">{icStats.total}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-600" /> New</div>
                  <div className="text-2xl font-bold text-green-600">{icStats.new}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><RefreshCw className="h-3 w-3 text-blue-600" /> Matched</div>
                  <div className="text-2xl font-bold text-blue-600">{icStats.matched}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-600" /> Review</div>
                  <div className="text-2xl font-bold text-amber-600">{icStats.needsReview}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Selected</div>
                  <div className="text-2xl font-bold">{icStats.selected}</div>
                </Card>
              </div>
            )}
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="profile"><User className="h-3 w-3 mr-1" /> Profile</TabsTrigger>
                <TabsTrigger value="ics">
                  <BookOpen className="h-3 w-3 mr-1" /> ICs
                  <Badge variant="secondary" className="ml-1 text-[10px]">{extracted.intellectual_contributions.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="quals">
                  <GraduationCap className="h-3 w-3 mr-1" /> Quals
                  <Badge variant="secondary" className="ml-1 text-[10px]">{extracted.qualifications.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="other"><Briefcase className="h-3 w-3 mr-1" /> Other</TabsTrigger>
                <TabsTrigger value="raw"><Eye className="h-3 w-3 mr-1" /> Raw</TabsTrigger>
              </TabsList>
              <TabsContent value="profile" className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="font-serif text-base">Extracted Profile</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => setEditingProfile(!editingProfile)}>
                      <Pencil className="h-3 w-3 mr-1" /> {editingProfile ? 'Done' : 'Edit'}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { key: 'first_name', label: 'First Name' },
                        { key: 'last_name', label: 'Last Name' },
                        { key: 'department', label: 'Department' },
                        { key: 'campus', label: 'Campus' },
                        { key: 'academic_rank', label: 'Academic Rank' },
                        { key: 'employee_id', label: 'Employee ID' },
                        { key: 'ft_pt_status', label: 'Status (FT/PT)' },
                        { key: 'highest_degree', label: 'Highest Degree' },
                        { key: 'highest_degree_date', label: 'Degree Date' },
                        { key: 'date_joining_aksob', label: 'Date Joining AKSOB' },
                      ].map(({ key, label }) => {
                        const newVal = (profileEdits as any)[key] || '';
                        const oldVal = profile ? (profile as any)[key] || '' : '';
                        const changed = newVal && newVal !== oldVal;
                        return (
                          <div key={key} className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">{label}</label>
                            {editingProfile ? (
                              <Input
                                value={newVal}
                                onChange={e => setProfileEdits({ ...profileEdits, [key]: e.target.value })}
                                className="text-sm"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{newVal || <span className="text-muted-foreground italic">—</span>}</span>
                                {changed && (
                                  <Badge variant="outline" className="text-[9px] text-blue-600 border-blue-300">
                                    was: {oldVal || 'empty'}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="ics" className="mt-4 space-y-3">
                {extracted.intellectual_contributions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No intellectual contributions found in this CV.</p>
                ) : (
                  <div className="border rounded-md overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead className="text-xs">Title / Citation</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Year</TableHead>
                          <TableHead className="text-xs">Quartile</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Confidence</TableHead>
                          <TableHead className="text-xs w-20">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {extracted.intellectual_contributions.map((ic, idx) => (
                          <TableRow key={idx} className={!ic._selected ? 'opacity-40' : ic._status === 'needs_review' ? 'bg-amber-500/5' : ic._status === 'matched' ? 'bg-blue-500/5' : ''}>
                            <TableCell>
                              <input type="checkbox" checked={ic._selected} onChange={() => toggleIc(idx)} />
                            </TableCell>
                            <TableCell className="max-w-sm">
                              {editingIcIdx === idx ? (
                                <div className="space-y-2">
                                  <Input value={ic.title} onChange={e => updateIc(idx, 'title', e.target.value)} placeholder="Title" className="text-xs" />
                                  <Input value={ic.authors || ''} onChange={e => updateIc(idx, 'authors', e.target.value)} placeholder="Authors" className="text-xs" />
                                  <Input value={ic.journal_outlet || ''} onChange={e => updateIc(idx, 'journal_outlet', e.target.value)} placeholder="Journal" className="text-xs" />
                                  <Input value={ic.doi || ''} onChange={e => updateIc(idx, 'doi', e.target.value)} placeholder="DOI" className="text-xs" />
                                  <div className="flex gap-2">
                                    <Select value={ic.ic_type || ''} onValueChange={v => updateIc(idx, 'ic_type', v)}>
                                      <SelectTrigger className="text-xs h-7"><SelectValue placeholder="Type" /></SelectTrigger>
                                      <SelectContent>{icTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Select value={ic.ic_category || ''} onValueChange={v => updateIc(idx, 'ic_category', v)}>
                                      <SelectTrigger className="text-xs h-7"><SelectValue placeholder="Category" /></SelectTrigger>
                                      <SelectContent>{icCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Select value={ic.quartile || ''} onValueChange={v => updateIc(idx, 'quartile', v)}>
                                      <SelectTrigger className="text-xs h-7"><SelectValue placeholder="Q" /></SelectTrigger>
                                      <SelectContent>{quartiles.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                                    </Select>
                                  </div>
                                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setEditingIcIdx(null)}>Done</Button>
                                </div>
                              ) : (
                                <div>
                                  <span className="text-xs line-clamp-2 font-medium">{ic.title}</span>
                                  {ic.authors && <span className="text-[10px] text-muted-foreground block">{ic.authors}</span>}
                                  {ic.journal_outlet && <span className="text-[10px] text-muted-foreground block italic">{ic.journal_outlet}</span>}
                                  {ic.source_section && <span className="text-[10px] text-muted-foreground/60 block">§{ic.source_section}</span>}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{ic.ic_type || '—'}</TableCell>
                            <TableCell className="text-xs">{ic.year || '—'}</TableCell>
                            <TableCell className="text-xs">{ic.quartile || '—'}</TableCell>
                            <TableCell>
                              <Badge variant={
                                ic._status === 'new' ? 'default' :
                                ic._status === 'matched' ? 'secondary' :
                                ic._status === 'needs_review' ? 'outline' : 'destructive'
                              } className="text-[10px] capitalize">
                                {ic._status === 'new' && '✦ New'}
                                {ic._status === 'matched' && '↻ Update'}
                                {ic._status === 'needs_review' && '⚠ Review'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={ic.confidence === 'high' ? 'default' : ic.confidence === 'medium' ? 'secondary' : 'destructive'} className="text-[10px]">
                                {ic.confidence || '—'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingIcIdx(editingIcIdx === idx ? null : idx)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => removeIc(idx)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="quals" className="mt-4">
                <Card>
                  <CardContent className="pt-4">
                    {extracted.qualifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No qualifications found.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Degree</TableHead>
                            <TableHead className="text-xs">Institution</TableHead>
                            <TableHead className="text-xs">Year</TableHead>
                            <TableHead className="text-xs">Field</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {extracted.qualifications.map((q, i) => {
                            const isDup = existingQuals.some((eq: any) => eq.degree_certification === q.degree_certification && eq.institution === q.institution);
                            return (
                              <TableRow key={i} className={isDup ? 'opacity-40' : ''}>
                                <TableCell className="text-xs">
                                  {q.degree_certification}
                                  {isDup && <Badge variant="outline" className="ml-2 text-[9px]">exists</Badge>}
                                </TableCell>
                                <TableCell className="text-xs">{q.institution || '—'}</TableCell>
                                <TableCell className="text-xs">{q.year || '—'}</TableCell>
                                <TableCell className="text-xs">{q.field_area || '—'}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="other" className="mt-4">
                <Accordion type="multiple" defaultValue={['engagements', 'services', 'awards', 'profexp']}>
                  {extracted.professional_experience && extracted.professional_experience.length > 0 && (
                    <AccordionItem value="profexp">
                      <AccordionTrigger className="text-sm">
                        <span className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Professional Experience <Badge variant="secondary" className="text-[10px]">{extracted.professional_experience.length}</Badge></span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Period</TableHead>
                              <TableHead className="text-xs">Organization</TableHead>
                              <TableHead className="text-xs">Position</TableHead>
                              <TableHead className="text-xs">Responsibilities</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {extracted.professional_experience.map((p, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{p.period || '—'}</TableCell>
                                <TableCell className="text-xs">{p.organization}</TableCell>
                                <TableCell className="text-xs">{p.position_title || '—'}</TableCell>
                                <TableCell className="text-xs">{p.key_responsibilities || '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                  <AccordionItem value="engagements">
                    <AccordionTrigger className="text-sm">
                      <span className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Engagements <Badge variant="secondary" className="text-[10px]">{extracted.engagements.length}</Badge></span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {extracted.engagements.length === 0 ? <p className="text-xs text-muted-foreground">None found</p> : (
                        <Table>
                          <TableHeader><TableRow><TableHead className="text-xs">Period</TableHead><TableHead className="text-xs">Activity</TableHead><TableHead className="text-xs">Details</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {extracted.engagements.map((e, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{e.from_to || '—'}</TableCell>
                                <TableCell className="text-xs">{e.activity}</TableCell>
                                <TableCell className="text-xs">{e.details || '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="services">
                    <AccordionTrigger className="text-sm">
                      <span className="flex items-center gap-2"><Shield className="h-4 w-4" /> Service <Badge variant="secondary" className="text-[10px]">{extracted.services.length}</Badge></span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {extracted.services.length === 0 ? <p className="text-xs text-muted-foreground">None found</p> : (
                        <Table>
                          <TableHeader><TableRow><TableHead className="text-xs">Period</TableHead><TableHead className="text-xs">Level</TableHead><TableHead className="text-xs">Committee / Role</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {extracted.services.map((s, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{s.from_to || '—'}</TableCell>
                                <TableCell className="text-xs">{s.level || '—'}</TableCell>
                                <TableCell className="text-xs">{s.committee_role}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="awards">
                    <AccordionTrigger className="text-sm">
                      <span className="flex items-center gap-2"><Award className="h-4 w-4" /> Awards <Badge variant="secondary" className="text-[10px]">{extracted.awards.length}</Badge></span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {extracted.awards.length === 0 ? <p className="text-xs text-muted-foreground">None found</p> : (
                        <Table>
                          <TableHeader><TableRow><TableHead className="text-xs">Year</TableHead><TableHead className="text-xs">Award</TableHead><TableHead className="text-xs">Organization</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {extracted.awards.map((a, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{a.year || '—'}</TableCell>
                                <TableCell className="text-xs">{a.award}</TableCell>
                                <TableCell className="text-xs">{a.institution_organization || '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>
              <TabsContent value="raw" className="mt-4">
                <Card>
                  <CardContent className="pt-4">
                    <pre className="text-xs whitespace-pre-wrap max-h-[400px] overflow-auto bg-muted/50 p-4 rounded-md font-mono">
                      {rawText || 'No raw text available'}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => { setStep('upload'); setExtracted(null); }}>
                ← Back to Upload
              </Button>
              <Button onClick={handleSave} disabled={saving} size="lg">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><Save className="h-4 w-4 mr-2" /> Save & Update All Dashboards</>}
              </Button>
            </div>
          </>
        )}
        {step === 'done' && saveResult && (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <CheckCircle className="h-16 w-16 mx-auto text-green-600" />
              <h2 className="text-xl font-serif font-bold text-foreground">CV Data Imported Successfully</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                All data has been saved and propagated to your profile, faculty dashboard, admin dashboard, and AACSB master dashboard.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-lg mx-auto mt-6">
                <div className="p-3 border rounded-md">
                  <div className="text-2xl font-bold text-green-600">{saveResult.icsInserted}</div>
                  <div className="text-[10px] text-muted-foreground">ICs Added</div>
                </div>
                <div className="p-3 border rounded-md">
                  <div className="text-2xl font-bold text-blue-600">{saveResult.icsUpdated}</div>
                  <div className="text-[10px] text-muted-foreground">ICs Updated</div>
                </div>
                <div className="p-3 border rounded-md">
                  <div className="text-2xl font-bold">{saveResult.profileUpdated}</div>
                  <div className="text-[10px] text-muted-foreground">Profile Fields</div>
                </div>
                <div className="p-3 border rounded-md">
                  <div className="text-2xl font-bold">{saveResult.qualAdded + saveResult.engAdded + saveResult.svcAdded + saveResult.awardAdded + saveResult.profExpAdded}</div>
                  <div className="text-[10px] text-muted-foreground">Other Entries</div>
                </div>
              </div>
              <div className="pt-4">
                <Button variant="outline" onClick={() => { setStep('upload'); setFile(null); setExtracted(null); setSaveResult(null); }}>
                  Upload Another CV
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default UploadCvPage;
