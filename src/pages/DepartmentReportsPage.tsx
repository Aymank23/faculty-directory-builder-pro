import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import KpiCard from '@/components/KpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Users, FileText, CheckCircle, TrendingUp, BookOpen, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { CHART_COLORS, disciplines } from '@/lib/constants';
import { normalizeNA, normalizeDepartment, normalizeDiscipline } from '@/lib/normalize';

const DepartmentReportsPage = () => {
  const { user } = useAuth();
  const userDept = user?.department ? normalizeDepartment(user.department) : '';
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');

  // Fetch all faculty and filter client-side via canonical department label so
  // legacy aliases (MKT, MGT, FINA, ITOM, …) resolve to the user's department.
  const { data: faculty = [] } = useQuery({
    queryKey: ['dept-report-faculty', userDept],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*');
      return (data || []).filter(f => normalizeDepartment(f.department) === userDept);
    },
    enabled: !!userDept,
  });

  const filteredFaculty = useMemo(
    () => disciplineFilter === 'all' ? faculty : faculty.filter((f: any) => normalizeDiscipline(f.discipline) === disciplineFilter),
    [faculty, disciplineFilter]
  );
  const facultyIds = filteredFaculty.map((f: any) => f.faculty_id);
  const facultyMap = Object.fromEntries(filteredFaculty.map((f: any) => [f.faculty_id, f]));

  const { data: ics = [] } = useQuery({
    queryKey: ['dept-report-ics', facultyIds],
    queryFn: async () => {
      if (facultyIds.length === 0) return [];
      const { data } = await supabase.from('intellectual_contributions').select('*').in('faculty_id', facultyIds);
      return data || [];
    },
    enabled: facultyIds.length > 0,
  });

  const verified = ics.filter(ic => ic.status === 'verified');
  const prjs = ics.filter(ic => ic.ic_type === 'PRJ');
  const q1 = ics.filter(ic => ic.quartile === 'Q1');

  // Per faculty
  const perFaculty: Record<string, { name: string; total: number; verified: number; prjs: number }> = {};
  filteredFaculty.forEach((f: any) => {
    perFaculty[f.faculty_id] = { name: `${f.first_name} ${f.last_name}`, total: 0, verified: 0, prjs: 0 };
  });
  ics.forEach(ic => {
    if (!perFaculty[ic.faculty_id]) return;
    perFaculty[ic.faculty_id].total++;
    if (ic.status === 'verified') perFaculty[ic.faculty_id].verified++;
    if (ic.ic_type === 'PRJ') perFaculty[ic.faculty_id].prjs++;
  });
  const perFacultyData = Object.values(perFaculty).sort((a, b) => b.total - a.total);

  // Year trend
  const yearCounts: Record<number, number> = {};
  ics.forEach(ic => { if (ic.year) yearCounts[ic.year] = (yearCounts[ic.year] || 0) + 1; });
  const yearData = Object.entries(yearCounts).sort().map(([year, count]) => ({ year, count }));

  // Category pie
  const catCounts: Record<string, number> = {};
  verified.forEach(ic => {
    const cat = ic.ic_category ? ic.ic_category.split('/')[0].trim() : 'Uncategorized';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });
  const catData = Object.entries(catCounts).map(([name, value]) => ({ name, value }));

  // Q distribution (normalize NA / N/A variants to a single bucket)
  const qCounts: Record<string, number> = {};
  ics.forEach(ic => { const q = normalizeNA(ic.quartile); qCounts[q] = (qCounts[q] || 0) + 1; });
  const qData = Object.entries(qCounts).map(([name, value]) => ({ name, value }));

  const hasData = ics.length > 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">Department Reports</h1>
          <p className="text-sm text-muted-foreground">{user?.department} — Analytics and productivity overview</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Faculty Members" value={faculty.length} icon={Users} />
          <KpiCard title="Total ICs" value={ics.length} icon={FileText} />
          <KpiCard title="Verified ICs" value={verified.length} icon={CheckCircle} variant="success" />
          <KpiCard title="Q1 Publications" value={q1.length} icon={TrendingUp} variant="success" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Total PRJs" value={prjs.length} icon={BookOpen} />
          <KpiCard title="Avg ICs/Faculty" value={faculty.length ? (ics.length / faculty.length).toFixed(1) : '0'} icon={BarChart3} />
        </div>

        {hasData ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="font-serif text-base">Publications by Year</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={yearData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="year" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="font-serif text-base">IC Category Balance (Verified)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                        {catData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="font-serif text-base">Quartile Distribution</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={qData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="value" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="font-serif text-base">Faculty Productivity</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Faculty</TableHead>
                      <TableHead className="text-right">Total ICs</TableHead>
                      <TableHead className="text-right">Verified</TableHead>
                      <TableHead className="text-right">PRJs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perFacultyData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right">{row.total}</TableCell>
                        <TableCell className="text-right">{row.verified}</TableCell>
                        <TableCell className="text-right">{row.prjs}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-16 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="font-serif text-lg text-foreground mb-2">No Data Yet</h3>
              <p className="text-sm text-muted-foreground">Department reports will populate once faculty data and ICs are imported.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default DepartmentReportsPage;
