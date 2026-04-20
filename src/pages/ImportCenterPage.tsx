import { useState, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, RotateCcw, Eye, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as XLSX from 'xlsx';
import { normalizeDepartment } from '@/lib/normalize';

/* ── Types ────────────────────────────────────────────── */

type ImportType = 'faculty' | 'teaching' | 'ic';
type ImportStrategy = 'skip_duplicates' | 'update_existing';
type RowStatus = 'new' | 'update' | 'no_change' | 'ambiguous' | 'invalid';

interface RowClassification {
  rowNum: number;
  employeeId: string;
  name: string;
  email: string;
  matchKey: string;
  matchedId: string | null;
  status: RowStatus;
  reason: string;
  changedFields: string[];
  mappedData: Record<string, any>;
}

interface ImportSummary {
  inserted: number;
  updated: number;
  skipped: number;
  noChange: number;
  failed: number;
  errors: string[];
}

interface ExistingFaculty {
  faculty_id: string;
  employee_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  department: string | null;
  campus: string | null;
  academic_rank: string | null;
  ft_pt_status: string | null;
  highest_degree: string | null;
  faculty_qualification: string | null;
  faculty_sufficiency: string | null;
  tenure_status: string | null;
  admin_title: string | null;
  degree_major: string | null;
  degree_institution: string | null;
  degree_country: string | null;
  middle_names: string | null;
  title: string | null;
  discipline_program: string | null;
  date_joining_aksob: string | null;
  highest_degree_date: string | null;
}

const importConfigs: Record<ImportType, { label: string; description: string; requiredCols: string[] }> = {
  faculty: {
    label: 'Faculty Profiles (AKSOB Database)',
    description: 'Import faculty records from the AKSOB HR database Excel file. Includes classification, sufficiency, tenure, and degree info.',
    requiredCols: ['First Name', 'Last Name', 'Department'],
  },
  teaching: {
    label: 'Teaching Load',
    description: 'Import course assignments by term',
    requiredCols: ['faculty_email_or_id', 'term', 'course_code', 'course_title'],
  },
  ic: {
    label: 'Intellectual Contributions',
    description: 'Import historical research outputs since Fall 2020',
    requiredCols: ['faculty_email_or_id', 'title', 'year'],
  },
};

/* ── Normalization helpers ─────────────────────────────── */

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

const hasValue = (value: unknown) => {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === 'number') return Number.isFinite(value);
  return String(value ?? '').trim() !== '';
};

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeHeaderKey = (value: string) =>
  normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

const normalizeEmployeeId = (value: unknown): string => {
  const raw = normalizeText(value);
  if (!raw) return '';
  return raw.replace(/\.0$/, '').replace(/[^\w]/g, '');
};

const normalizeEmail = (value: unknown): string =>
  normalizeText(value).toLowerCase().replace(/[\u00A0\u200B]/g, '');

const normalizeName = (value: unknown): string =>
  normalizeText(value)
    .toLowerCase()
    .replace(/['\u2019`]/g, "'")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-');

const createRowAccessor = (row: Record<string, any>) => {
  const normalizedEntries = new Map<string, any>();
  Object.entries(row).forEach(([key, value]) => {
    normalizedEntries.set(normalizeHeaderKey(key), value);
  });
  return (...candidates: string[]) => {
    for (const candidate of candidates) {
      const exact = row[candidate];
      if (hasValue(exact)) return exact;
    }
    for (const candidate of candidates) {
      const normalized = normalizedEntries.get(normalizeHeaderKey(candidate));
      if (hasValue(normalized)) return normalized;
    }
    return null;
  };
};

const normalizeFacultyQualification = (value: unknown) => {
  const n = normalizeText(value).toUpperCase();
  return ['SA', 'PA', 'IP', 'IA', 'A', 'SP'].includes(n) ? n : null;
};

const normalizeFacultySufficiency = (value: unknown) => {
  const n = normalizeText(value).toLowerCase();
  if (!n) return null;
  if (n.includes('participating')) return 'Participating';
  if (n.includes('supporting')) return 'Supporting';
  return null;
};

const mapFacultyStatus = (status: string): string => {
  if (!status) return 'FT';
  const s = status.toLowerCase();
  if (s.includes('part-time') || s.includes('part time') || s.includes('adjunct')) return 'PT';
  return 'FT';
};

const parseFlexibleDate = (value: any): string | null => {
  if (!hasValue(value)) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().split('T')[0];
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 59 && value < 60000) {
      const parsed = new Date(EXCEL_EPOCH_UTC + value * 86400000);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
    }
    return null;
  }
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized.slice(0, 10);
  const match = normalized.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (match) {
    const [, day, monthLabel, yearValue] = match;
    const months: Record<string, string> = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
    const month = months[monthLabel.toLowerCase()];
    if (!month) return null;
    let year = Number(yearValue);
    if (yearValue.length === 2) year += year >= 50 ? 1900 : 2000;
    return `${year}-${month}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
};

const formatPreviewValue = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().split('T')[0];
  return normalizeText(value);
};

/* ── Deterministic matching ────────────────────────────── */

interface MatchResult {
  matchedId: string | null;
  matchKey: string;
  reason: string;
  ambiguous: boolean;
}

const findMatch = (
  empId: string, email: string, firstName: string, lastName: string,
  _dept: string, _campus: string,
  empIdIndex: Map<string, string>,
  emailIndex: Map<string, string>,
  nameIndex: Map<string, string[]>,
): MatchResult => {
  if (empId) {
    const match = empIdIndex.get(empId);
    if (match) return { matchedId: match, matchKey: `Employee ID: ${empId}`, reason: 'Matched by Employee ID', ambiguous: false };
  }
  if (email) {
    const match = emailIndex.get(email);
    if (match) return { matchedId: match, matchKey: `Email: ${email}`, reason: 'Matched by normalized email', ambiguous: false };
  }
  if (!empId && !email) {
    const fullName = normalizeName(`${firstName} ${lastName}`);
    if (fullName.trim()) {
      const candidates = nameIndex.get(fullName);
      if (candidates && candidates.length === 1) {
        return { matchedId: candidates[0], matchKey: `Name: ${fullName}`, reason: 'Matched by name (single match, no ID/email available)', ambiguous: false };
      }
      if (candidates && candidates.length > 1) {
        return { matchedId: null, matchKey: `Name: ${fullName}`, reason: `Multiple possible name matches (${candidates.length} candidates)`, ambiguous: true };
      }
    }
    return { matchedId: null, matchKey: 'None', reason: 'Blank Employee ID and blank email; no name match found', ambiguous: false };
  }
  return { matchedId: null, matchKey: empId ? `Employee ID: ${empId}` : `Email: ${email}`, reason: 'No existing record found', ambiguous: false };
};

/* ── Field-level diff (no-op detection) ────────────────── */

const COMPARE_FIELDS = [
  'first_name', 'last_name', 'department', 'campus', 'academic_rank',
  'ft_pt_status', 'highest_degree', 'employee_id', 'faculty_qualification',
  'faculty_sufficiency', 'email', 'tenure_status', 'admin_title',
  'degree_major', 'degree_institution', 'degree_country', 'middle_names',
  'title', 'discipline_program', 'date_joining_aksob', 'highest_degree_date',
] as const;

const computeChangedFields = (newRow: Record<string, any>, existing: ExistingFaculty): string[] => {
  const changed: string[] = [];
  for (const field of COMPARE_FIELDS) {
    const newVal = normalizeText(newRow[field] ?? '');
    const oldVal = normalizeText((existing as any)[field] ?? '');
    if (!newVal && oldVal) continue;
    if (newVal !== oldVal) changed.push(field);
  }
  return changed;
};

const buildUpdatePayload = (mappedData: Record<string, any>, changedFields: string[]): Record<string, any> => {
  const payload: Record<string, any> = {};
  for (const field of changedFields) {
    const val = mappedData[field];
    if (val !== null && val !== undefined && val !== '') payload[field] = val;
  }
  return payload;
};

/* ── Map an Excel row to faculty profile fields ──────── */

const mapExcelRowToFaculty = (r: Record<string, any>): Record<string, any> => {
  const val = createRowAccessor(r);
  const empId = normalizeEmployeeId(val('ID', 'employee_id', 'Employee ID'));
  const firstName = normalizeText(val('First Name', 'first_name'));
  const lastName = normalizeText(val('Last Name', 'last_name'));
  const row: Record<string, any> = {
    first_name: firstName || null,
    last_name: lastName || null,
    department: ((): string | null => {
      const raw = normalizeText(val('Department', 'department'));
      if (!raw) return null;
      const canon = normalizeDepartment(raw);
      return canon === 'N/A' ? null : canon;
    })(),
    campus: normalizeText(val('Campus', 'campus')) || null,
    academic_rank: normalizeText(val('Rank', 'academic_rank', 'Academic Rank')) || null,
    ft_pt_status: mapFacultyStatus(normalizeText(val('Status', 'ft_pt_status', 'Faculty Status'))),
    highest_degree: normalizeText(val('Highest Degree', 'highest_degree')) || null,
    employee_id: empId || null,
    faculty_qualification: normalizeFacultyQualification(val('Faculty Qualifications', 'faculty_qualification', 'Classification')),
    faculty_sufficiency: normalizeFacultySufficiency(val('Faculty Sufficiency', 'faculty_sufficiency', 'Participation Status')),
    email: normalizeEmail(val('Email Address', 'email', 'Faculty Email')) || null,
    tenure_status: normalizeText(val('Tenure Status', 'tenure_status')) || null,
    admin_title: normalizeText(val('Admin Title', 'admin_title')) || null,
    degree_major: normalizeText(val('Major', 'degree_major')) || null,
    degree_institution: normalizeText(val('Establishment', 'degree_institution', 'Institution')) || null,
    degree_country: normalizeText(val('Country', 'degree_country')) || null,
    middle_names: normalizeText(val('Middle Names', 'middle_names')) || null,
    title: normalizeText(val('Title', 'title')) || null,
    discipline_program: normalizeText(val('Major', 'discipline_program')) || null,
  };
  const hireDate = val('HR Hiredate', 'date_joining_aksob', 'Hire Date');
  if (hireDate) { const p = parseFlexibleDate(hireDate); if (p) row.date_joining_aksob = p; }
  const degreeDate = val('Date Earned', 'highest_degree_date', 'Highest Degree Date');
  if (degreeDate) { const p = parseFlexibleDate(degreeDate); if (p) row.highest_degree_date = p; }
  return row;
};

/* ── Status badge config ────────────────────────────── */

const statusConfig: Record<RowStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  new: { label: 'New', variant: 'default' },
  update: { label: 'Update', variant: 'secondary' },
  no_change: { label: 'No Change', variant: 'outline' },
  ambiguous: { label: 'Ambiguous', variant: 'destructive' },
  invalid: { label: 'Invalid', variant: 'destructive' },
};

/* ── Header mapping definition ──────────────────────── */

const HEADER_MAP: Record<string, string> = {
  id: 'employee_id', employeeid: 'employee_id', employee_id: 'employee_id',
  title: 'title', firstname: 'first_name', first_name: 'first_name',
  middlenames: 'middle_names', middle_names: 'middle_names',
  lastname: 'last_name', last_name: 'last_name',
  department: 'department', campus: 'campus',
  rank: 'academic_rank', academicrank: 'academic_rank',
  admintitle: 'admin_title', admin_title: 'admin_title',
  status: 'ft_pt_status', facultystatus: 'ft_pt_status',
  emailaddress: 'email', email: 'email', facultyemail: 'email',
  facultyqualifications: 'faculty_qualification', classification: 'faculty_qualification',
  facultysufficiency: 'faculty_sufficiency', participationstatus: 'faculty_sufficiency',
  hrhiredate: 'date_joining_aksob', hiredate: 'date_joining_aksob',
  tenurestatus: 'tenure_status',
  highestdegree: 'highest_degree',
  dateearned: 'highest_degree_date', highestdegreedate: 'highest_degree_date',
  major: 'degree_major', establishment: 'degree_institution', institution: 'degree_institution',
  country: 'degree_country',
};

/* ══════════════════════════════════════════════════════ */
/*  Component                                            */
/* ══════════════════════════════════════════════════════ */

const ImportCenterPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [importType, setImportType] = useState<ImportType>('faculty');
  const [allData, setAllData] = useState<Record<string, any>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [strategy, setStrategy] = useState<ImportStrategy>('update_existing');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [classifiedRows, setClassifiedRows] = useState<RowClassification[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [headerMapping, setHeaderMapping] = useState<{ excelHeader: string; mappedTo: string }[]>([]);

  const computeHeaderMapping = (cols: string[]) =>
    cols.map(col => ({ excelHeader: col, mappedTo: HEADER_MAP[normalizeHeaderKey(col)] || '(unmapped)' }));

  const clearSelectedFile = () => {
    if (fileRef.current) fileRef.current.value = '';
  };

  const resetState = () => {
    setAllData([]); setColumns([]); setSummary(null);
    setClassifiedRows([]); setAnalyzed(false); setHeaderMapping([]);
    clearSelectedFile();
  };

  /* ── File upload ─────────────────────────────────────── */

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onerror = () => {
      clearSelectedFile();
      toast.error(`Could not read ${file.name}`);
    };

    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        if (!(buffer instanceof ArrayBuffer)) throw new Error('Invalid file data');

        const data = new Uint8Array(buffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = wb.SheetNames[0];
        const ws = firstSheetName ? wb.Sheets[firstSheetName] : null;
        if (!ws) throw new Error('No worksheet found in file');

        const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '', raw: true });
        if (json.length === 0) {
          resetState();
          toast.error(`No rows found in ${file.name}`);
          return;
        }

        const cols = Object.keys(json[0]);
        setColumns(cols);
        setAllData(json);
        setSummary(null);
        setClassifiedRows([]);
        setAnalyzed(false);
        if (importType === 'faculty') setHeaderMapping(computeHeaderMapping(cols));
        toast.success(`Loaded ${json.length} rows from ${file.name}`);
      } catch (err: any) {
        resetState();
        toast.error(err.message || `Failed to parse ${file.name}`);
      } finally {
        clearSelectedFile();
      }
    };

    reader.readAsArrayBuffer(file);
  };

  /* ── Dry-run analysis ───────────────────────────────── */

  const buildClassifications = async (): Promise<RowClassification[]> => {
    const { data: existing } = await supabase
      .from('faculty_profiles')
      .select('faculty_id, employee_id, email, first_name, last_name, department, campus, academic_rank, ft_pt_status, highest_degree, faculty_qualification, faculty_sufficiency, tenure_status, admin_title, degree_major, degree_institution, degree_country, middle_names, title, discipline_program, date_joining_aksob, highest_degree_date');

    const facultyList = (existing || []) as ExistingFaculty[];
    const empIdIndex = new Map<string, string>();
    const emailIndex = new Map<string, string>();
    const nameIndex = new Map<string, string[]>();

    for (const f of facultyList) {
      const empId = normalizeEmployeeId(f.employee_id);
      if (empId) empIdIndex.set(empId, f.faculty_id);
      const email = normalizeEmail(f.email);
      if (email) emailIndex.set(email, f.faculty_id);
      const fullName = normalizeName(`${f.first_name ?? ''} ${f.last_name ?? ''}`);
      if (fullName.trim()) {
        const arr = nameIndex.get(fullName) || [];
        arr.push(f.faculty_id);
        nameIndex.set(fullName, arr);
      }
    }

    const facultyById = new Map<string, ExistingFaculty>();
    for (const f of facultyList) facultyById.set(f.faculty_id, f);

    const classifications: RowClassification[] = [];

    for (let i = 0; i < allData.length; i++) {
      const r = allData[i];
      const mapped = mapExcelRowToFaculty(r);
      const empId = normalizeEmployeeId(mapped.employee_id);
      const email = normalizeEmail(mapped.email);
      const firstName = normalizeText(mapped.first_name);
      const lastName = normalizeText(mapped.last_name);
      const dept = normalizeText(mapped.department);
      const campus = normalizeText(mapped.campus);
      const displayName = `${firstName} ${lastName}`.trim();

      if (!firstName && !lastName) {
        classifications.push({ rowNum: i + 1, employeeId: empId, name: displayName, email, matchKey: 'None', matchedId: null, status: 'invalid', reason: 'Missing first and last name', changedFields: [], mappedData: mapped });
        continue;
      }

      const match = findMatch(empId, email, firstName, lastName, dept, campus, empIdIndex, emailIndex, nameIndex);

      if (match.ambiguous) {
        classifications.push({ rowNum: i + 1, employeeId: empId, name: displayName, email, matchKey: match.matchKey, matchedId: null, status: 'ambiguous', reason: match.reason, changedFields: [], mappedData: mapped });
        continue;
      }

      if (match.matchedId) {
        const existingRecord = facultyById.get(match.matchedId);
        const changedFields = existingRecord ? computeChangedFields(mapped, existingRecord) : [];
        classifications.push({
          rowNum: i + 1, employeeId: empId, name: displayName, email,
          matchKey: match.matchKey, matchedId: match.matchedId,
          status: changedFields.length > 0 ? 'update' : 'no_change',
          reason: changedFields.length > 0
            ? `${match.reason} \u2014 ${changedFields.length} field(s) differ: ${changedFields.join(', ')}`
            : `${match.reason} \u2014 all fields identical`,
          changedFields, mappedData: mapped,
        });
      } else {
        classifications.push({ rowNum: i + 1, employeeId: empId, name: displayName, email, matchKey: match.matchKey, matchedId: null, status: 'new', reason: match.reason, changedFields: [], mappedData: mapped });
      }
    }

    return classifications;
  };

  const runDryAnalysis = async () => {
    if (allData.length === 0 || importType !== 'faculty') return;
    setAnalyzing(true);
    try {
      const classifications = await buildClassifications();
      setClassifiedRows(classifications);
      setAnalyzed(true);
    } catch (err: any) {
      toast.error(err.message || 'Analysis failed');
    }
    setAnalyzing(false);
  };

  /* ── Computed summary from dry-run ───────────────────── */

  const dryRunSummary = useMemo(() => {
    const counts = { new: 0, update: 0, no_change: 0, ambiguous: 0, invalid: 0 };
    for (const row of classifiedRows) counts[row.status]++;
    const totalMatchRate = classifiedRows.length > 0
      ? ((counts.update + counts.no_change) / classifiedRows.length * 100).toFixed(0)
      : '0';
    const highDuplicateWarning = classifiedRows.length > 0 &&
      (counts.update + counts.no_change) / classifiedRows.length > 0.8;
    return { ...counts, totalMatchRate, highDuplicateWarning };
  }, [classifiedRows]);

  /* ── Execute import ──────────────────────────────────── */

  const handleImport = async () => {
    if (allData.length === 0) return;
    setImporting(true);
    const result: ImportSummary = { inserted: 0, updated: 0, skipped: 0, noChange: 0, failed: 0, errors: [] };

    try {
      // Auto-run classification for faculty imports if not already done
      let rowsToProcess = classifiedRows;
      if (importType === 'faculty') {
        if (rowsToProcess.length === 0) {
          rowsToProcess = await buildClassifications();
          setClassifiedRows(rowsToProcess);
          setAnalyzed(true);
        }
        for (const row of rowsToProcess) {
          try {
            if (row.status === 'invalid') { result.failed++; continue; }
            if (row.status === 'ambiguous') { result.skipped++; result.errors.push(`Row ${row.rowNum} (${row.name}): Ambiguous match \u2014 skipped`); continue; }
            if (row.status === 'no_change') { result.noChange++; continue; }

            if (row.status === 'new') {
              const { error } = await supabase.from('faculty_profiles').insert(row.mappedData);
              if (error) { result.failed++; result.errors.push(`Row ${row.rowNum} (${row.name}): ${error.message}`); }
              else result.inserted++;
              continue;
            }

            if (row.status === 'update') {
              if (strategy === 'skip_duplicates') { result.skipped++; continue; }
              const payload = buildUpdatePayload(row.mappedData, row.changedFields);
              if (Object.keys(payload).length === 0) { result.noChange++; continue; }
              const { error } = await supabase.from('faculty_profiles').update(payload).eq('faculty_id', row.matchedId!);
              if (error) { result.failed++; result.errors.push(`Row ${row.rowNum} (${row.name}): ${error.message}`); }
              else result.updated++;
            }
          } catch (err: any) {
            result.failed++;
            result.errors.push(`Row ${row.rowNum}: ${err.message}`);
          }
        }
      } else if (importType === 'teaching') {
        const { data: facultyList } = await supabase.from('faculty_profiles').select('faculty_id, employee_id, first_name, last_name');
        const empMap = Object.fromEntries((facultyList || []).filter(f => f.employee_id).map(f => [f.employee_id, f.faculty_id]));
        const nameMap = Object.fromEntries((facultyList || []).map(f => [`${f.first_name} ${f.last_name}`.toLowerCase(), f.faculty_id]));
        const rows = allData.map(r => {
          const key = r.faculty_email_or_id || r.employee_id || '';
          const facultyId = empMap[key] || nameMap[key.toLowerCase()] || null;
          return { faculty_id: facultyId, term: r.term || r.Term || '', course_code: r.course_code || r.CourseCode || '', course_title: r.course_title || r.CourseTitle || '', section: r.section || r.Section || null, campus: r.campus || r.Campus || null, credits: r.credits ? Number(r.credits) : 3 };
        }).filter(r => r.faculty_id);
        if (rows.length === 0) { toast.error('No rows matched existing faculty.'); setImporting(false); return; }
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from('teaching_load').insert(rows.slice(i, i + 500));
          if (error) { result.failed += rows.slice(i, i + 500).length; result.errors.push(error.message); } else result.inserted += rows.slice(i, i + 500).length;
        }
        result.skipped = allData.length - rows.length;
      } else if (importType === 'ic') {
        const { data: facultyList } = await supabase.from('faculty_profiles').select('faculty_id, employee_id, first_name, last_name');
        const empMap = Object.fromEntries((facultyList || []).filter(f => f.employee_id).map(f => [f.employee_id, f.faculty_id]));
        const nameMap = Object.fromEntries((facultyList || []).map(f => [`${f.first_name} ${f.last_name}`.toLowerCase(), f.faculty_id]));
        const rows = allData.map(r => {
          const key = r.faculty_email_or_id || r.employee_id || '';
          const facultyId = empMap[key] || nameMap[key.toLowerCase()] || null;
          return { faculty_id: facultyId, title: r.title || r.Title || '', year: r.year ? parseInt(r.year) : null, ic_type: r.ic_type || r.Type || null, ic_category: r.ic_category || r.Category || null, journal_outlet: r.journal_outlet || r.Journal || null, quartile: r.quartile || r.Quartile || null, abdc_rank: r.abdc_rank || r.ABDC || null, doi: r.doi || r.DOI || null, authors: r.authors || r.Authors || null, status: 'under_review' };
        }).filter(r => r.faculty_id && r.title);
        if (rows.length === 0) { toast.error('No rows matched existing faculty or had titles.'); setImporting(false); return; }
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from('intellectual_contributions').insert(rows.slice(i, i + 500));
          if (error) { result.failed += rows.slice(i, i + 500).length; result.errors.push(error.message); } else result.inserted += rows.slice(i, i + 500).length;
        }
        result.skipped = allData.length - rows.length;
      }

      await supabase.from('audit_log').insert({
        user_id: user!.id, action: `import_${importType}`,
        target_table: importType === 'faculty' ? 'faculty_profiles' : importType === 'teaching' ? 'teaching_load' : 'intellectual_contributions',
        details: { total: allData.length, strategy, ...result },
      });

      setSummary(result);
      setSummaryOpen(true);
      queryClient.invalidateQueries({ queryKey: ['all-faculty'] });
      toast.success(`Import complete: ${result.inserted} inserted, ${result.updated} updated`);
      resetState();
      setAllData([]);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    }
    setImporting(false);
  };

  /* ── Render ──────────────────────────────────────────── */

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">Import Center</h1>
          <p className="text-sm text-muted-foreground">Upload structured data files to populate the system</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.entries(importConfigs) as [ImportType, typeof importConfigs.faculty][]).map(([key, cfg]) => (
            <Card key={key} className={`cursor-pointer transition-colors ${importType === key ? 'border-primary' : ''}`} onClick={() => { setImportType(key); resetState(); }}>
              <CardContent className="p-5">
                <FileSpreadsheet className={`h-6 w-6 mb-2 ${importType === key ? 'text-primary' : 'text-muted-foreground'}`} />
                <h3 className="font-medium text-sm text-foreground">{cfg.label}</h3>
                <p className="text-xs text-muted-foreground mt-1">{cfg.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-base">Upload {importConfigs[importType].label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Required columns: {importConfigs[importType].requiredCols.join(', ')}
            </p>
            {importType === 'faculty' && (
              <p className="text-xs text-muted-foreground">
                Matching priority: Employee ID → email → faculty name (only when ID & email are blank). Files are analyzed in a non-destructive dry run before import.
              </p>
            )}

            <div className="flex flex-wrap gap-3 items-center">
              <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Select File
              </Button>

              {allData.length > 0 && importType === 'faculty' && (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground">Strategy:</span>
                  {(['skip_duplicates', 'update_existing'] as ImportStrategy[]).map(s => (
                    <Button key={s} size="sm" variant={strategy === s ? 'default' : 'outline'} onClick={() => setStrategy(s)} className="text-xs">
                      {s === 'skip_duplicates' ? 'Skip Duplicates' : 'Update Existing'}
                    </Button>
                  ))}
                </div>
              )}

              {allData.length > 0 && importType === 'faculty' && !analyzed && (
                <Button onClick={runDryAnalysis} disabled={analyzing} variant="secondary">
                  <Eye className="h-4 w-4 mr-2" />
                  {analyzing ? 'Analyzing\u2026' : 'Dry Run / Preview'}
                </Button>
              )}

              {allData.length > 0 && importType === 'faculty' && (
                <>
                  <Button onClick={handleImport} disabled={importing || analyzing}>
                    <Play className="h-4 w-4 mr-2" /> {importing ? 'Importing\u2026' : 'Import Now'}
                  </Button>
                  {analyzed && (
                    <Button variant="ghost" size="sm" onClick={() => { resetState(); setAllData([]); }}>
                      <RotateCcw className="h-4 w-4 mr-2" /> Reset
                    </Button>
                  )}
                </>
              )}

              {allData.length > 0 && importType !== 'faculty' && (
                <Button onClick={handleImport} disabled={importing}>
                  <CheckCircle className="h-4 w-4 mr-2" /> {importing ? 'Importing\u2026' : `Import ${allData.length} Records`}
                </Button>
              )}
            </div>

            {/* Dry-run summary badges */}
            {analyzed && classifiedRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{classifiedRows.length} rows analyzed</Badge>
                  {dryRunSummary.new > 0 && <Badge variant="default">{dryRunSummary.new} new</Badge>}
                  {dryRunSummary.update > 0 && <Badge variant="secondary" className="border border-info/40 text-info">{dryRunSummary.update} will update</Badge>}
                  {dryRunSummary.no_change > 0 && <Badge variant="outline">{dryRunSummary.no_change} no change</Badge>}
                  {dryRunSummary.ambiguous > 0 && (
                    <Badge variant="outline" className="border-warning/40 text-warning">
                      <AlertTriangle className="h-3 w-3 mr-1" /> {dryRunSummary.ambiguous} ambiguous
                    </Badge>
                  )}
                  {dryRunSummary.invalid > 0 && <Badge variant="outline" className="border-destructive/40 text-destructive">{dryRunSummary.invalid} invalid</Badge>}
                </div>

                {dryRunSummary.highDuplicateWarning && (
                  <div className="flex items-start gap-2 p-3 rounded-md border border-warning/40 bg-warning/5">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Unusually high match rate detected ({dryRunSummary.totalMatchRate}%)</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {dryRunSummary.no_change > 0
                          ? `${dryRunSummary.no_change} row(s) are already identical in the database and will be skipped. ${dryRunSummary.update} row(s) have field differences and can be updated.`
                          : 'Most uploaded rows match existing records. Please review the classification table below before importing.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tabs: Classification Table + Header Mapping + Raw Data */}
            {analyzed && classifiedRows.length > 0 && (
              <Tabs defaultValue="classification" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="classification">Row Classification</TabsTrigger>
                  <TabsTrigger value="headers">Header Mapping</TabsTrigger>
                  <TabsTrigger value="raw">Raw Data</TabsTrigger>
                </TabsList>

                <TabsContent value="classification" className="mt-3">
                  <div className="overflow-auto max-h-[420px] border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-10">#</TableHead>
                          <TableHead className="text-xs">Employee ID</TableHead>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Email</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Match Key</TableHead>
                          <TableHead className="text-xs min-w-[200px]">Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {classifiedRows.map((row) => {
                          const cfg = statusConfig[row.status];
                          return (
                            <TableRow key={row.rowNum} className={row.status === 'no_change' ? 'opacity-50' : ''}>
                              <TableCell className="text-xs font-mono">{row.rowNum}</TableCell>
                              <TableCell className="text-xs font-mono">{row.employeeId || '\u2014'}</TableCell>
                              <TableCell className="text-xs">{row.name || '\u2014'}</TableCell>
                              <TableCell className="text-xs truncate max-w-[140px]">{row.email || '\u2014'}</TableCell>
                              <TableCell>
                                <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">{row.matchKey}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{row.reason}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="headers" className="mt-3">
                  <div className="border rounded-md overflow-auto max-h-80">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Excel Header</TableHead>
                          <TableHead className="text-xs">Mapped To</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {headerMapping.map((h, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-mono">{h.excelHeader}</TableCell>
                            <TableCell className="text-xs">{h.mappedTo}</TableCell>
                            <TableCell>
                              <Badge variant={h.mappedTo === '(unmapped)' ? 'destructive' : 'outline'} className="text-xs">
                                {h.mappedTo === '(unmapped)' ? 'Unmapped' : 'OK'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="raw" className="mt-3">
                  {allData.length > 20 && <p className="text-xs text-muted-foreground mb-2">Showing first 20 of {allData.length} rows</p>}
                  <div className="overflow-auto max-h-96 border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {columns.map(c => <TableHead key={c} className="text-xs whitespace-nowrap">{c}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allData.slice(0, 20).map((row, i) => (
                          <TableRow key={i}>
                            {columns.map(c => <TableCell key={c} className="text-xs whitespace-nowrap">{formatPreviewValue(row[c])}</TableCell>)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {/* Non-faculty: simple raw preview */}
            {allData.length > 0 && importType !== 'faculty' && (
              <div className="overflow-auto max-h-96 border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map(c => <TableHead key={c} className="text-xs whitespace-nowrap">{c}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allData.slice(0, 20).map((row, i) => (
                      <TableRow key={i}>
                        {columns.map(c => <TableCell key={c} className="text-xs whitespace-nowrap">{formatPreviewValue(row[c])}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Import Summary Dialog */}
        <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="font-serif">Import Summary</DialogTitle></DialogHeader>
            {summary && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-md bg-success/10 text-center">
                    <p className="text-2xl font-bold text-success">{summary.inserted}</p>
                    <p className="text-xs text-success">Inserted</p>
                  </div>
                  <div className="p-3 rounded-md bg-info/10 text-center">
                    <p className="text-2xl font-bold text-info">{summary.updated}</p>
                    <p className="text-xs text-info">Updated</p>
                  </div>
                  <div className="p-3 rounded-md bg-muted text-center">
                    <p className="text-2xl font-bold text-muted-foreground">{summary.noChange}</p>
                    <p className="text-xs text-muted-foreground">No Change</p>
                  </div>
                  <div className="p-3 rounded-md bg-warning/10 text-center">
                    <p className="text-2xl font-bold text-warning">{summary.skipped}</p>
                    <p className="text-xs text-warning">Skipped</p>
                  </div>
                  <div className="p-3 rounded-md bg-destructive/10 text-center col-span-2">
                    <p className="text-2xl font-bold text-destructive">{summary.failed}</p>
                    <p className="text-xs text-destructive">Failed</p>
                  </div>
                </div>
                {summary.errors.length > 0 && (
                  <div className="border rounded-md p-3 max-h-40 overflow-auto">
                    <p className="text-xs font-medium text-destructive mb-1">Details:</p>
                    {summary.errors.slice(0, 10).map((err, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{err}</p>
                    ))}
                    {summary.errors.length > 10 && <p className="text-xs text-muted-foreground mt-1">{'\u2026'}and {summary.errors.length - 10} more</p>}
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setSummaryOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default ImportCenterPage;
