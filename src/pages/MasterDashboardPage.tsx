import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { fetchSchoolCanonical } from '@/lib/canonicalData';
import { normalizeDepartment } from '@/lib/normalize';
import {
  buildTable81, deriveTable81Type, normalizePortfolio, quartileBucket, primaryAuthor,
  TABLE81_TYPES, PORTFOLIOS,
} from '@/lib/table81';
import Table81View from '@/components/v2/Table81View';

const ALL = 'all';
const NOT_SET = 'Not set';
const val = (v: any) => (v && String(v).trim()) || NOT_SET;

type FacFilter = { dept: string; disc: string; ps: string; cls: string; q: string };

function Dist({ title, data, onPick }: { title: string; data: Record<string, number>; onPick?: (k: string) => void }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="font-serif text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1.5">
        {entries.length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
        {entries.map(([k, n]) => (
          <button key={k} onClick={() => onPick?.(k)} disabled={!onPick} className="w-full text-left group">
            <div className="flex justify-between text-xs"><span className="group-hover:text-primary truncate pr-2">{k}</span><span className="font-medium">{n}</span></div>
            <div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${(n / max) * 100}%` }} /></div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, onClick }: { label: string; value: string | number; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-left rounded-lg border bg-card p-4 hover:border-primary transition-colors">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-serif">{value}</p>
    </button>
  );
}

const MasterDashboardPage = () => {
  const [tab, setTab] = useState('overview');
  const [year, setYear] = useState(ALL);
  const [ff, setFf] = useState<FacFilter>({ dept: ALL, disc: ALL, ps: ALL, cls: ALL, q: '' });
  const { data, isLoading } = useQuery({ queryKey: ['v2-school'], queryFn: fetchSchoolCanonical });

  const faculty = useMemo(() => (data?.faculty || []).map((f: any) => ({ ...f, department: f.department ? normalizeDepartment(f.department) : null })), [data]);
  const icsYear = useMemo(() => (data?.ics || []).filter((ic) => year === ALL || String(ic.year) === year), [data, year]);
  const years = useMemo(() => [...new Set((data?.ics || []).map((i) => i.year).filter(Boolean))].sort((a: any, b: any) => b - a), [data]);

  const t81 = useMemo(() => {
    const fmap = new Map(faculty.map((f: any) => [f.faculty_id, f]));
    return buildTable81(icsYear, data?.authors || [], (id) => (fmap.get(id) as any)?.discipline || null);
  }, [icsYear, data, faculty]);

  const count = (rows: any[], fn: (r: any) => string) => rows.reduce((m: Record<string, number>, r) => ((m[fn(r)] = (m[fn(r)] || 0) + 1), m), {});
  const fmap = useMemo(() => new Map(faculty.map((f: any) => [f.faculty_id, f])), [faculty]);
  const discOfIc = (icId: string) => { const pa = primaryAuthor(data?.authors || [], icId); return val(pa && (fmap.get(pa.faculty_id) as any)?.discipline); };

  const goFaculty = (patch: Partial<FacFilter>) => { setFf({ dept: ALL, disc: ALL, ps: ALL, cls: ALL, q: '', ...patch }); setTab('faculty'); };

  const filteredFaculty = faculty.filter((f: any) =>
    (ff.dept === ALL || val(f.department) === ff.dept) &&
    (ff.disc === ALL || val(f.discipline) === ff.disc) &&
    (ff.ps === ALL || val(f.faculty_sufficiency) === ff.ps) &&
    (ff.cls === ALL || val(f.faculty_qualification) === ff.cls) &&
    (!ff.q || `${f.first_name} ${f.last_name} ${f.employee_id || ''}`.toLowerCase().includes(ff.q.toLowerCase())),
  ).sort((a: any, b: any) => `${a.last_name}`.localeCompare(`${b.last_name}`));

  const opts = (fn: (f: any) => string) => [...new Set(faculty.map(fn))].sort();
  const counted = t81.counted;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">Master Dashboard</h1>
          <p className="text-sm text-muted-foreground">School-level view generated from faculty records. Totals are never typed in.</p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="faculty">Faculty</TabsTrigger>
              <TabsTrigger value="t81">Table 8.1</TabsTrigger>
            </TabsList>
            {tab !== 'faculty' && (
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent><SelectItem value={ALL}>All years</SelectItem>{years.map((y: any) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Kpi label="Total Faculty" value={faculty.length} onClick={() => goFaculty({})} />
              <Kpi label="Total Qualifying ICs" value={counted.length} onClick={() => setTab('t81')} />
              <Kpi label="Total School Points" value={counted.length.toFixed(2)} onClick={() => setTab('t81')} />
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Dist title="Participating / Supporting" data={count(faculty, (f) => val(f.faculty_sufficiency))} onPick={(k) => goFaculty({ ps: k })} />
              <Dist title="AACSB Classification" data={count(faculty, (f) => val(f.faculty_qualification))} onPick={(k) => goFaculty({ cls: k })} />
              <Dist title="Faculty by Department" data={count(faculty, (f) => val(f.department))} onPick={(k) => goFaculty({ dept: k })} />
              <Dist title="Faculty by Discipline" data={count(faculty, (f) => val(f.discipline))} onPick={(k) => goFaculty({ disc: k })} />
              <Dist title="Journal Quality (qualifying ICs)" data={Object.fromEntries(['Q1', 'Q2', 'Q3', 'Q4', 'Unranked / N.A.'].map((q) => [q, counted.filter((i) => quartileBucket(i.quartile) === q).length]))} onPick={() => setTab('t81')} />
              <Dist title="IC Reporting Type" data={Object.fromEntries(TABLE81_TYPES.map((ty) => [ty, counted.filter((i) => deriveTable81Type(i.historical_reporting_type) === ty).length]))} onPick={() => setTab('t81')} />
              <Dist title="Scholarship Portfolio" data={Object.fromEntries(PORTFOLIOS.map((p) => [p, counted.filter((i) => normalizePortfolio(i.scholarship_portfolio) === p).length]))} onPick={() => setTab('t81')} />
              <Dist title="ICs by Discipline" data={count(counted, (i) => discOfIc(i.id))} onPick={() => setTab('t81')} />
            </div>
            <p className="text-xs text-muted-foreground">
              Pilot phase: IC figures include only faculty migrated to the shared-publication model and only records that reviewers have Verified.
            </p>
          </TabsContent>

          <TabsContent value="faculty" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Search name or ID" className="w-56" value={ff.q} onChange={(e) => setFf({ ...ff, q: e.target.value })} />
              {([
                ['dept', 'Department', (f: any) => val(f.department)],
                ['disc', 'Discipline', (f: any) => val(f.discipline)],
                ['ps', 'Participating / Supporting', (f: any) => val(f.faculty_sufficiency)],
                ['cls', 'AACSB Classification', (f: any) => val(f.faculty_qualification)],
              ] as const).map(([k, label, fn]) => (
                <Select key={k} value={(ff as any)[k]} onValueChange={(v) => setFf({ ...ff, [k]: v })}>
                  <SelectTrigger className="w-52"><SelectValue placeholder={label} /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>All — {label}</SelectItem>{opts(fn).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setFf({ dept: ALL, disc: ALL, ps: ALL, cls: ALL, q: '' })}>Clear</Button>
            </div>
            <p className="text-xs text-muted-foreground">{filteredFaculty.length} faculty</p>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Department</TableHead><TableHead>Discipline</TableHead><TableHead>Participating / Supporting</TableHead><TableHead>AACSB Classification</TableHead><TableHead className="w-16 text-right">Profile</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredFaculty.map((f: any) => (
                      <TableRow key={f.faculty_id}>
                        <TableCell className="font-medium"><Link to={`/faculty/${f.faculty_id}`} className="hover:text-primary">{f.first_name} {f.last_name}</Link></TableCell>
                        <TableCell className="text-sm">{f.department || '—'}</TableCell>
                        <TableCell className="text-sm">{f.discipline || '—'}</TableCell>
                        <TableCell className="text-sm">{f.faculty_sufficiency || '—'}</TableCell>
                        <TableCell className="text-sm">{f.faculty_qualification || '—'}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm" aria-label={`Open ${f.first_name} ${f.last_name}`}><Link to={`/faculty/${f.faculty_id}`}><Eye className="h-4 w-4" /></Link></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="t81">
            <Table81View ics={icsYear} authors={data?.authors || []} faculty={faculty} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default MasterDashboardPage;
