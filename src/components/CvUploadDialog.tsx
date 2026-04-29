import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, FileText, Loader2, Check, X, AlertTriangle, Pencil, Trash2, Eye } from 'lucide-react';
import { icTypes, icCategories, quartiles } from '@/lib/constants';
import * as XLSX from 'xlsx';

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
  source_file?: string;
  raw_text?: string;
  _selected?: boolean;
  _editing?: boolean;
  _status?: 'ready' | 'needs_review' | 'rejected';
}

interface ExtractedData {
  personal_info?: { first_name?: string; last_name?: string; department?: string; campus?: string; employee_id?: string };
  qualifications: { degree_certification: string; institution?: string; year?: number; field_area?: string }[];
  engagements: { from_to?: string; activity: string; details?: string }[];
  services: { from_to?: string; level?: string; committee_role: string }[];
  awards: { year?: number; award: string; institution_organization?: string }[];
  intellectual_contributions: ExtractedIC[];
}

interface CvUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facultyId: string;
  userId: string;
}

const CvUploadDialog = ({ open, onOpenChange, facultyId, userId }: CvUploadDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingIcIdx, setEditingIcIdx] = useState<number | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [showRawText, setShowRawText] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setExtracted(null); setRawText(''); }
  };

  /**
   * Extract text from a file. For DOCX, uses the server-side parser.
   */
  const extractText = async (f: File): Promise<string> => {
    if (f.name.endsWith('.txt') || f.name.endsWith('.csv')) return await f.text();

    if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      return wb.SheetNames.map(name => `--- ${name} ---\n` + XLSX.utils.sheet_to_csv(wb.Sheets[name])).join('\n\n');
    }

    // For DOCX files — use the server-side DOCX parser
    if (f.name.endsWith('.docx') || f.name.endsWith('.doc')) {
      const arrayBuf = await f.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      // Convert to base64
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

      if (error) {
        console.error('DOCX parse error:', error);
        throw new Error('Failed to parse DOCX file. Please try converting to .txt format.');
      }

      if (data?.error) throw new Error(data.error);

      const text = data?.text || '';
      if (text.length < 50) {
        throw new Error('Could not extract sufficient text from the DOCX file. The file may be empty or corrupted.');
      }

      return text;
    }

    // Fallback for PDF and other formats
    const text = await f.text();
    if (text.includes('\x00') || text.length < 50) {
      const arrayBuf = await f.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const raw = decoder.decode(bytes);
      return raw.replace(/[^\x20-\x7E\n\r\t\u00C0-\u024F]/g, ' ').replace(/\s{3,}/g, '\n').trim();
    }
    return text;
  };

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    try {
      const cvText = await extractText(file);
      setRawText(cvText);

      if (cvText.trim().length < 20) {
        toast.error('Could not extract enough text from the file. Try a .docx or .txt format.');
        setExtracting(false);
        return;
      }

      toast.info(`Extracted ${cvText.length} characters. Sending to AI for parsing...`);

      const { data, error } = await supabase.functions.invoke('parse-cv', { body: { cvText } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Enhance ICs with source traceability and status
      if (data.intellectual_contributions) {
        data.intellectual_contributions = data.intellectual_contributions.map((ic: ExtractedIC) => ({
          ...ic,
          _selected: true,
          source_file: file.name,
          _status: ic.confidence === 'low' ? 'needs_review' as const : 'ready' as const,
        }));
      }

      setExtracted(data as ExtractedData);
      const icCount = data.intellectual_contributions?.length || 0;
      const otherCount = (data.qualifications?.length || 0) + (data.engagements?.length || 0) + (data.services?.length || 0) + (data.awards?.length || 0);
      toast.success(`Extracted ${icCount} ICs and ${otherCount} other entries from CV`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse CV');
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

  const bulkApprove = () => {
    if (!extracted) return;
    const updated = extracted.intellectual_contributions.map(ic => ({
      ...ic,
      _selected: ic._status !== 'rejected',
      _status: ic._status === 'rejected' ? 'rejected' as const : 'ready' as const,
    }));
    setExtracted({ ...extracted, intellectual_contributions: updated });
    toast.success('All valid ICs approved');
  };

  const handleImport = async () => {
    if (!extracted) return;
    setImporting(true);
    try {
      const promises: PromiseLike<any>[] = [];

      if (extracted.qualifications?.length) {
        promises.push(supabase.from('academic_qualifications').insert(
          extracted.qualifications.map(q => ({ faculty_id: facultyId, degree_certification: q.degree_certification, institution: q.institution || null, year: q.year || null, field_area: q.field_area || null }))
        ).then());
      }
      if (extracted.engagements?.length) {
        promises.push(supabase.from('professional_engagements').insert(
          extracted.engagements.map(e => ({ faculty_id: facultyId, from_to: e.from_to || null, activity: e.activity, details: e.details || null }))
        ).then());
      }
      if (extracted.services?.length) {
        promises.push(supabase.from('service_contributions').insert(
          extracted.services.map(s => ({ faculty_id: facultyId, from_to: s.from_to || null, level: s.level || null, committee_role: s.committee_role }))
        ).then());
      }
      if (extracted.awards?.length) {
        promises.push(supabase.from('awards_recognition').insert(
          extracted.awards.map(a => ({ faculty_id: facultyId, year: a.year || null, award: a.award, institution_organization: a.institution_organization || null }))
        ).then());
      }

      const selectedIcs = (extracted.intellectual_contributions || []).filter(ic => ic._selected);
      if (selectedIcs.length) {
        promises.push(supabase.from('intellectual_contributions').insert(
          selectedIcs.map(ic => ({
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
          }))
        ).then());
      }

      const results = await Promise.all(promises);
      const anyError = results.find(r => r.error);
      if (anyError?.error) throw anyError.error;

      await supabase.from('audit_log').insert({
        user_id: userId, action: 'import_cv', target_table: 'multiple',
        target_record: facultyId,
        details: {
          source_file: file?.name,
          qualifications: extracted.qualifications?.length || 0,
          engagements: extracted.engagements?.length || 0,
          services: extracted.services?.length || 0,
          awards: extracted.awards?.length || 0,
          intellectual_contributions: selectedIcs.length,
          extraction_timestamp: new Date().toISOString(),
        },
      });

      toast.success(`CV data imported: ${selectedIcs.length} ICs + ${(extracted.qualifications?.length || 0) + (extracted.engagements?.length || 0) + (extracted.services?.length || 0) + (extracted.awards?.length || 0)} other entries`);
      queryClient.invalidateQueries();
      onOpenChange(false);
      setFile(null);
      setExtracted(null);
      setRawText('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to import CV data');
    }
    setImporting(false);
  };

  const sectionSummary = (label: string, items: any[] | undefined) => {
    if (!items?.length) {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">{label}</span>
            <Badge variant="secondary" className="text-xs">0</Badge>
          </div>
          <p className="ml-6 text-xs text-muted-foreground">No records</p>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{label}</span>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
        <ul className="ml-6 space-y-0.5">
          {items.slice(0, 3).map((item, i) => (
            <li key={i} className="text-xs text-muted-foreground truncate">
              {item.degree_certification || item.activity || item.committee_role || item.award}
            </li>
          ))}
          {items.length > 3 && <li className="text-xs text-muted-foreground">…and {items.length - 3} more</li>}
        </ul>
      </div>
    );
  };

  const selectedIcCount = (extracted?.intellectual_contributions || []).filter(ic => ic._selected).length;
  const needsReviewCount = (extracted?.intellectual_contributions || []).filter(ic => ic._status === 'needs_review').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Import from CV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a Word (.docx) or text (.txt) CV file. AI will extract qualifications, ICs, professional engagements, service contributions, and awards. Review and edit before importing.
          </p>

          <div className="flex items-center gap-3">
            <input type="file" ref={fileRef} accept=".docx,.doc,.pdf,.txt,.xlsx,.xls" onChange={handleFile} className="hidden" />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Select CV File
            </Button>
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span className="truncate max-w-48">{file.name}</span>
                <Badge variant="outline" className="text-[10px]">{(file.size / 1024).toFixed(0)} KB</Badge>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setFile(null); setExtracted(null); setRawText(''); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {file && !extracted && (
            <Button onClick={handleExtract} disabled={extracting} className="w-full">
              {extracting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Extracting with AI…</> : 'Extract CV Data'}
            </Button>
          )}

          {extracted && (
            <Tabs defaultValue="ics" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="ics">
                  ICs
                  <Badge variant="secondary" className="ml-2 text-xs">{extracted.intellectual_contributions?.length || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger value="other">
                  Other
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {(extracted.qualifications?.length || 0) + (extracted.engagements?.length || 0) + (extracted.services?.length || 0) + (extracted.awards?.length || 0)}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="raw">
                  <Eye className="h-3 w-3 mr-1" />
                  Raw Text
                </TabsTrigger>
              </TabsList>

              <TabsContent value="ics" className="space-y-3 mt-3">
                {needsReviewCount > 0 && (
                  <div className="flex items-center gap-2 p-2 rounded-md border border-warning/40 bg-warning/5 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                    <span>{needsReviewCount} IC(s) flagged as low confidence — please review before importing.</span>
                  </div>
                )}

                {(extracted.intellectual_contributions || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No intellectual contributions extracted from this CV.</p>
                ) : (
                  <>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" className="text-xs" onClick={bulkApprove}>Approve All Valid</Button>
                    </div>
                    <div className="border rounded-md overflow-auto max-h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8"></TableHead>
                            <TableHead className="text-xs">Title / Citation</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Category</TableHead>
                            <TableHead className="text-xs">Year</TableHead>
                            <TableHead className="text-xs">Quartile</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs w-16">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {extracted.intellectual_contributions.map((ic, idx) => (
                            <TableRow key={idx} className={!ic._selected ? 'opacity-40' : ic._status === 'needs_review' ? 'bg-warning/5' : ''}>
                              <TableCell>
                                <input type="checkbox" checked={ic._selected} onChange={() => toggleIc(idx)} className="rounded border-border" />
                              </TableCell>
                              <TableCell className="max-w-xs">
                                {editingIcIdx === idx ? (
                                  <Input value={ic.title} onChange={e => updateIc(idx, 'title', e.target.value)} className="text-xs" />
                                ) : (
                                  <div>
                                    <span className="text-xs line-clamp-2">{ic.title}</span>
                                    {ic.source_section && <span className="text-[10px] text-muted-foreground block mt-0.5">Section: {ic.source_section}</span>}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {editingIcIdx === idx ? (
                                  <Select value={ic.ic_type || ''} onValueChange={v => updateIc(idx, 'ic_type', v)}>
                                    <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                                    <SelectContent>{icTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                  </Select>
                                ) : (
                                  <Badge variant="outline" className="text-xs">{ic.ic_type || '—'}</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {editingIcIdx === idx ? (
                                  <Select value={ic.ic_category || ''} onValueChange={v => updateIc(idx, 'ic_category', v)}>
                                    <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                                    <SelectContent>{icCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs">{ic.ic_category ? ic.ic_category.replace(' Scholarship', '') : '—'}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {editingIcIdx === idx ? (
                                  <Input type="number" value={ic.year || ''} onChange={e => updateIc(idx, 'year', parseInt(e.target.value) || null)} className="h-7 text-xs w-16" />
                                ) : (
                                  <span className="text-xs">{ic.year || '—'}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {editingIcIdx === idx ? (
                                  <Select value={ic.quartile || ''} onValueChange={v => updateIc(idx, 'quartile', v)}>
                                    <SelectTrigger className="h-7 text-xs w-16"><SelectValue /></SelectTrigger>
                                    <SelectContent>{quartiles.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs">{ic.quartile || '—'}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={ic.confidence === 'high' ? 'default' : ic.confidence === 'low' ? 'destructive' : 'secondary'}
                                  className="text-xs"
                                >
                                  {ic.confidence === 'low' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                  {ic._status === 'needs_review' ? 'Review' : ic.confidence || 'medium'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingIcIdx(editingIcIdx === idx ? null : idx)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeIc(idx)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
                <p className="text-xs text-muted-foreground">{selectedIcCount} of {extracted.intellectual_contributions?.length || 0} ICs selected for import. Source: {file?.name}</p>
              </TabsContent>

              <TabsContent value="other" className="space-y-3 mt-3">
                <div className="border rounded-md p-4 space-y-3 bg-muted/30">
                  {sectionSummary('Qualifications', extracted.qualifications)}
                  {sectionSummary('Professional Engagements', extracted.engagements)}
                  {sectionSummary('Service Contributions', extracted.services)}
                  {sectionSummary('Awards & Recognition', extracted.awards)}
                </div>
              </TabsContent>

              <TabsContent value="raw" className="mt-3">
                <div className="border rounded-md p-3 bg-muted/30 max-h-[400px] overflow-auto">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                    {rawText || 'No raw text available.'}
                  </pre>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {rawText.length} characters extracted from {file?.name}
                </p>
              </TabsContent>
            </Tabs>
          )}
        </div>

        {extracted && (
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setExtracted(null); setRawText(''); }}>Re-extract</Button>
            <Button onClick={handleImport} disabled={importing || selectedIcCount === 0}>
              {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing…</> : `Import ${selectedIcCount} ICs + Other Sections`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CvUploadDialog;
