import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import { departments, disciplines } from '@/lib/constants';
import { normalizeDepartment, normalizeDiscipline } from '@/lib/normalize';
import * as XLSX from 'xlsx';

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

  // Requirement 14: export verified ICs only, with the source classification and
  // the AACSB reporting type side by side. Academic Engagement is exported separately.
  const reportableIcs = ics.filter((ic: any) =>
    (ic.record_class || 'ic') === 'ic' && (ic.verification_status || ic.status) === 'verified'
  );

  const exportRows = reportableIcs.filter(ic => {
    const fac = facultyMap[ic.faculty_id];
    if (deptFilter !== 'all' && normalizeDepartment(fac?.department) !== deptFilter) return false;
    if (disciplineFilter !== 'all' && normalizeDiscipline(fac?.discipline) !== disciplineFilter) return false;
    return true;
  }).map(ic => {
    const fac = facultyMap[ic.faculty_id];
    return {
      'Faculty Name': fac ? `${fac.first_name} ${fac.last_name}` : 'Unknown',
      'Department': fac?.department ? normalizeDepartment(fac.department) : '',
      'Discipline': fac?.discipline ? normalizeDiscipline(fac.discipline) : '',
      'Campus': fac?.campus || '',
      'Academic Rank': fac?.academic_rank || '',
      'Original CV Item Type': (ic as any).original_cv_item_type || '',
      'IC Reporting Type': (ic as any).ic_reporting_type || 'Needs Review',
      'IC Category': ic.ic_category || '',
      'IC Type': ic.ic_type || '',
      'Year': ic.year || '',
      'Journal / Outlet': ic.journal_outlet || '',
      'Quartile': ic.quartile || '',
      'ABDC Rank': ic.abdc_rank || '',
      'DOI': ic.doi || '',
      'Evidence': ic.evidence_file_url ? 'Yes' : 'No',
      'Verification Date': ic.verification_date ? new Date(ic.verification_date).toLocaleDateString() : '',
      'Canonical Key': (ic as any).canonical_key || '',
    };
  });

  const engagementRows = ics
    .filter((ic: any) => ic.record_class === 'academic_engagement')
    .map((ic: any) => {
      const fac = facultyMap[ic.faculty_id];
      return {
        'Faculty Name': fac ? `${fac.first_name} ${fac.last_name}` : 'Unknown',
        'Department': fac?.department ? normalizeDepartment(fac.department) : '',
        'Discipline': fac?.discipline ? normalizeDiscipline(fac.discipline) : '',
        'Original CV Item Type': ic.original_cv_item_type || '',
        'Year': ic.year || '',
        'Activity': ic.title || '',
        'Verification Status': ic.verification_status || ic.status || '',
      };
    });

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Intellectual Contributions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(engagementRows), 'Academic Engagement');
    XLSX.writeFile(wb, `AACSB_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">AACSB Exports</h1>
            <p className="text-sm text-muted-foreground">Export verified intellectual contributions for accreditation</p>
          </div>
          <Button onClick={handleExport} disabled={exportRows.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export to Excel
          </Button>
        </div>

        <div className="flex gap-3 flex-wrap">
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
        </div>

        <Card>
          <CardContent className="p-0">
            {exportRows.length === 0 ? (
              <div className="text-center py-16">
                <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No verified intellectual contributions available for export.</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(exportRows[0]).map(k => <TableHead key={k} className="text-xs whitespace-nowrap">{k}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exportRows.map((row, i) => (
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
