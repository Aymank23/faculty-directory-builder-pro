import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchSchoolCanonical } from '@/lib/canonicalData';
import { normalizeDepartment } from '@/lib/normalize';
import Table81View from '@/components/v2/Table81View';

// Uses the SAME canonical service + Table 8.1 engine as the Master Dashboard (single counting engine).
const ALL = 'all';
const AACSBExportsPage = () => {
  const { data, isLoading } = useQuery({ queryKey: ['v2-school'], queryFn: fetchSchoolCanonical });
  const [year, setYear] = useState(ALL);
  const [dept, setDept] = useState(ALL);

  const faculty = useMemo(() => (data?.faculty || []).map((f: any) => ({ ...f, department: f.department ? normalizeDepartment(f.department) : null })), [data]);
  const years = useMemo(() => [...new Set((data?.ics || []).map((i) => i.year).filter(Boolean))].sort((a: any, b: any) => b - a), [data]);
  const depts = useMemo(() => [...new Set(faculty.map((f: any) => f.department).filter(Boolean))].sort(), [faculty]);

  // Department filter keeps ICs with at least one confirmed author in that department.
  const ics = useMemo(() => {
    const deptOf = new Map(faculty.map((f: any) => [f.faculty_id, f.department]));
    return (data?.ics || []).filter((ic) =>
      (year === ALL || String(ic.year) === year) &&
      (dept === ALL || (data?.authors || []).some((a) => a.canonical_ic_id === ic.id && a.link_status === 'confirmed' && deptOf.get(a.faculty_id) === dept)));
  }, [data, faculty, year, dept]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">AACSB Exports</h1>
            <p className="text-sm text-muted-foreground">Table 8.1 and supporting records, generated from the same calculation as the Master Dashboard.</p>
          </div>
          <div className="flex gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All years</SelectItem>{years.map((y: any) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All departments</SelectItem>{depts.map((d: any) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : <Table81View ics={ics} authors={data?.authors || []} faculty={faculty} />}
      </div>
    </AppLayout>
  );
};

export default AACSBExportsPage;
