import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import { departments, disciplines } from '@/lib/constants';
import { normalizeDepartment, normalizeDiscipline } from '@/lib/normalize';
import * as XLSX from 'xlsx';
import {
  eligibleIcs, onlyAcademicEngagement, verificationLabel,
  dedupeSharedIcs, buildSharedKeySet, isSharedRecord, canonicalKeyOf,
} from '@/lib/icMetrics';

const AACSBExportsPage = () => {
  const [deptFilter, setDeptFilter] = useState('all');
  const [disciplineFilter, setDisciplineFilter] = useState('all');

  const { data: faculty = [] } = useQuery({
    queryKey: ['export-faculty'],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*');
      return data || [];
    },
  });

  const { data: ics = [] } = useQuery({
    queryKey: ['export-ics'],
    queryFn: async () => {
      const { data } = await supabase.from('intellectual_contributions').select('*');
      return data || [];
    },
  });

  const facultyMap = Object.fromEntries(faculty.map(f => [f.faculty_id, f]));

  const inScope = (ic: any) => {
    const fac = facultyMap[ic.faculty_id];
    if (deptFilter !== 'all' && normalizeDepartment(fac?.department) !== deptFilter) return false;
    if (disciplineFilter !== 'all' && normalizeDiscipline(fac?.discipline) !== disciplineFilter) return false;
    return true;
  };

  // Only eligible (record_class = ic, Verified, reportable type) records may be
  // exported. Academic Engagement never enters IC totals.
  const reportableIcs = eligibleIcs(ics).filter(inScope);
  const sharedKeys = buildSharedKeySet(ics);
  // School-level totals count shared publications once.
  const countedIcs = dedupeSharedIcs(reportableIcs);

  const tally = (rows: any[], keyFn: (r: any) => string) => {
    const out: Record<string, number> = {};
    for (const r of rows) {
      const k = keyFn(r) || 'Unspecified';
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  };

  const summarySection = (label: string, counts: Record<string, number>) => {
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return [
      { Category: label, Value: '', Count: '' },
      ...entries.map(([k, v]) => ({ Category: '', Value: k, Count: v })),
      { Category: '', Value: 'Subtotal', Count: entries.reduce((s, [, v]) => s + v, 0) },
      { Category: '', Value: '', Count: '' },
    ];
  };

  const summaryRows = [
    { Category: 'School-level total (Verified, deduplicated)', Value: '', Count: countedIcs.length },
    { Category: '', Value: '', Count: '' },
    ...summarySection('Totals by IC Reporting Type', tally(countedIcs, r => r.ic_reporting_type)),
    ...summarySection('Totals by Basic / Applied / Pedagogical', tally(countedIcs, r => r.ic_category)),
    ...summarySection('Totals by Department', tally(countedIcs, r => normalizeDepartment(facultyMap[r.faculty_id]?.department))),
    ...summarySection('Totals by Discipline', tally(countedIcs, r => normalizeDiscipline(facultyMap[r.faculty_id]?.discipline))),
    ...summarySection('Totals by Year', tally(countedIcs, r => (r.year ? String(r.year) : ''))),
    ...summarySection('Totals by Quartile', tally(countedIcs, r => r.quartile)),
  ];

  const supportingRows = reportableIcs.map((ic: any) => {
    const fac = facultyMap[ic.faculty_id];
    return {
      'Faculty Member': fac ? `${fac.first_name} ${fac.last_name}` : 'Unknown',
      'Employee ID': fac?.employee_id || '',
      'Department': fac?.department ? normalizeDepartment(fac.department) : '',
      'Original CV Item Type': ic.original_cv_item_type || '',
      'IC Reporting Type': ic.ic_reporting_type || 'Needs Review',
      'Title': ic.title || '',
      'Authors': ic.authors || '',
      'Year': ic.year || '',
      'Journal/Outlet': ic.journal_outlet || '',
      'Basic/Applied/Pedagogical': ic.ic_category || '',
      'Quartile': ic.quartile || '',
      'DOI/Identifier': ic.doi || canonicalKeyOf(ic) || '',
      'Verification Status': verificationLabel(ic),
      'Duplicate/Shared Record': isSharedRecord(ic, sharedKeys) ? 'Shared — counted once at school level' : 'No',
    };
  });

  const engagementRows = onlyAcademicEngagement(ics).filter(inScope).map((ic: any) => {
    const fac = facultyMap[ic.faculty_id];
    return {
      'Faculty Member': fac ? `${fac.first_name} ${fac.last_name}` : 'Unknown',
      'Employee ID': fac?.employee_id || '',
      'Department': fac?.department ? normalizeDepartment(fac.department) : '',
      'Original CV Item Type': ic.original_cv_item_type || '',
      'Year': ic.year || '',
      'Activity': ic.title || '',
      'Verification Status': verificationLabel(ic),
    };
  });

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supportingRows), 'Supporting Records');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(engagementRows), 'Academic Engagement');
    XLSX.writeFile(wb, `AACSB_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">AACSB Exports</h1>
            <p className="text-sm text-muted-foreground">
              Two-sheet workbook: Summary totals and Supporting Records. Verified, non-duplicated intellectual contributions only.
            </p>
          </div>
          <Button onClick={handleExport} disabled={supportingRows.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export to Excel
          </Button>
        </div>

        <div className="flex gap-3 flex-wrap items-center">
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Disciplines</SelectItem>
              {disciplines.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {supportingRows.length} supporting record(s) · {countedIcs.length} counted at school level · {engagementRows.length} academic engagement record(s)
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            {supportingRows.length === 0 ? (
              <div className="text-center py-16">
                <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No verified intellectual contributions available for export.</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(supportingRows[0]).map(k => <TableHead key={k} className="text-xs whitespace-nowrap">{k}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supportingRows.map((row, i) => (
                      <TableRow key={i}>
                        {Object.values(row).map((v, j) => <TableCell key={j} className="text-xs whitespace-nowrap">{String(v ?? '')}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AACSBExportsPage;
