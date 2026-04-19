import { useState } from 'react';
import DashboardTour from '@/components/DashboardTour';
import AppLayout from '@/components/AppLayout';
import KpiCard from '@/components/KpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, BookOpen, FileText, Clock, CheckCircle, XCircle, TrendingUp, Users, UserCheck, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { CHART_COLORS, departments, campuses, icCategories, icTypes, quartiles, icStatuses, facultyQualifications } from '@/lib/constants';
import { normalizeNA, isNA } from '@/lib/normalize';

const CLASSIFICATION_COLORS: Record<string, string> = {
  SA: 'hsl(var(--chart-1))',
  PA: 'hsl(var(--chart-2))',
  IP: 'hsl(var(--chart-3))',
  IA: 'hsl(var(--chart-4))',
  A: 'hsl(var(--chart-5))',
  SP: 'hsl(220 14% 60%)',
};

const MasterDashboardPage = () => {
  const [deptFilter, setDeptFilter] = useState('all');
  const [campusFilter, setCampusFilter] = useState('all');
  const [yearFrom, setYearFrom] = useState('2020');
  const [yearTo, setYearTo] = useState(new Date().getFullYear().toString());
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [quartileFilter, setQuartileFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: allIcs = [] } = useQuery({
    queryKey: ['admin-ics'],
    queryFn: async () => {
      const { data } = await supabase.from('intellectual_contributions').select('*');
      return data || [];
    },
  });

  const { data: faculty = [] } = useQuery({
    queryKey: ['admin-faculty'],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*');
      return data || [];
    },
  });

  const facultyMap = Object.fromEntries(faculty.map(f => [f.faculty_id, f]));

  const fromYear = parseInt(yearFrom) || 2020;
  const toYear = parseInt(yearTo) || new Date().getFullYear();
  const ics = allIcs.filter(ic => {
    const fac = facultyMap[ic.faculty_id];
    if (deptFilter !== 'all' && fac?.department !== deptFilter) return false;
    if (campusFilter !== 'all' && fac?.campus !== campusFilter) return false;
    if (ic.year && (ic.year < fromYear || ic.year > toYear)) return false;
    if (categoryFilter !== 'all' && ic.ic_category !== categoryFilter) return false;
    if (typeFilter !== 'all' && ic.ic_type !== typeFilter) return false;
    if (quartileFilter !== 'all' && ic.quartile !== quartileFilter) return false;
    if (statusFilter !== 'all' && ic.status !== statusFilter) return false;
    return true;
  });

  const filteredFaculty = faculty.filter(f => {
    if (deptFilter !== 'all' && f.department !== deptFilter) return false;
    if (campusFilter !== 'all' && f.campus !== campusFilter) return false;
    return true;
  });

  const verified = ics.filter(ic => ic.status === 'verified');
  const underReview = ics.filter(ic => ic.status === 'under_review');
  const rejected = ics.filter(ic => ic.status === 'rejected');
  const prjs = ics.filter(ic => ic.ic_type === 'PRJ');
  const q1 = ics.filter(ic => ic.quartile === 'Q1');

  // AACSB Classification distribution (normalize NA / N/A → "N/A")
  const classificationCounts: Record<string, number> = {};
  filteredFaculty.forEach(f => {
    const raw = (f as any).faculty_qualification;
    const q = raw == null || String(raw).trim() === '' ? 'Unclassified' : normalizeNA(raw);
    classificationCounts[q] = (classificationCounts[q] || 0) + 1;
  });
  const classificationData = Object.entries(classificationCounts)
    .filter(([name]) => name !== 'Unclassified' || classificationCounts['Unclassified'] > 0)
    .map(([name, value]) => ({ name, value, pct: filteredFaculty.length ? ((value / filteredFaculty.length) * 100).toFixed(1) : '0' }));

  // Participating faculty %
  const participatingCount = filteredFaculty.filter(f => (f as any).faculty_sufficiency === 'Participating').length;
  const participatingPct = filteredFaculty.length ? ((participatingCount / filteredFaculty.length) * 100).toFixed(1) : '0';

  // Category distribution (verified only)
  const catCounts: Record<string, number> = {};
  verified.forEach(ic => {
    const cat = ic.ic_category ? ic.ic_category.split('/')[0].trim() : 'Uncategorized';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });
  const catData = Object.entries(catCounts).map(([name, value]) => ({ name, value }));

  // Year trend
  const yearCounts: Record<number, number> = {};
  ics.forEach(ic => { if (ic.year) yearCounts[ic.year] = (yearCounts[ic.year] || 0) + 1; });
  const yearData = Object.entries(yearCounts).sort().map(([year, count]) => ({ year, count }));

  // Department breakdown
  const deptCounts: Record<string, number> = {};
  ics.forEach(ic => {
    const fac = facultyMap[ic.faculty_id];
    const dept = fac?.department || 'Unknown';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });
  const deptData = Object.entries(deptCounts).map(([name, value]) => ({ name, value }));

  // Publications per faculty
  const perFaculty: Record<string, { name: string; department: string; count: number }> = {};
  ics.forEach(ic => {
    const fac = facultyMap[ic.faculty_id];
    if (!fac) return;
    if (!perFaculty[fac.faculty_id]) {
      perFaculty[fac.faculty_id] = { name: `${fac.first_name} ${fac.last_name}`, department: fac.department || '', count: 0 };
    }
    perFaculty[fac.faculty_id].count++;
  });
  const perFacultyData = Object.values(perFaculty).sort((a, b) => b.count - a.count);

  // Q distribution (normalize NA / N/A variants to a single bucket)
  const qCounts: Record<string, number> = {};
  ics.forEach(ic => { const q = normalizeNA(ic.quartile); qCounts[q] = (qCounts[q] || 0) + 1; });
  const qData = Object.entries(qCounts).map(([name, value]) => ({ name, value }));

  const hasData = ics.length > 0 || filteredFaculty.length > 0;

  const resetFilters = () => {
    setDeptFilter('all'); setCampusFilter('all'); setYearFrom('2020');
    setYearTo(new Date().getFullYear().toString()); setCategoryFilter('all');
    setTypeFilter('all'); setQuartileFilter('all'); setStatusFilter('all');
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">Master AACSB Dashboard</h1>
            <p className="text-sm text-muted-foreground">Aggregated faculty portfolio and accreditation overview</p>
          </div>
          <DashboardTour
            storageKey="tour-admin-dashboard"
            steps={[
              { target: '[data-tour="filters"]', title: 'Filters', description: 'Narrow data by department, campus, year range, IC category, type, quartile, and status.' },
              { target: '[data-tour="kpi-row"]', title: 'Key Metrics', description: 'At-a-glance KPIs showing faculty count, verified ICs, PRJs, and Q1 publications.' },
              { target: '[data-tour="aacsb-stats"]', title: 'AACSB Statistics', description: 'Classification distribution and participating faculty percentage.' },
              { target: '[data-tour="charts"]', title: 'Visual Analytics', description: 'Charts showing trends, distributions, and per-faculty productivity.' },
            ]}
          />
        </div>

        {/* Filters */}
        <div data-tour="filters" className="flex flex-wrap gap-3 items-end">
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={campusFilter} onValueChange={setCampusFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Campus" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campuses</SelectItem>
              {campuses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="IC Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {icCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="IC Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {icTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={quartileFilter} onValueChange={setQuartileFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Quartile" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Quartiles</SelectItem>
              {quartiles.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {icStatuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Year</Label>
            <Input type="number" value={yearFrom} onChange={e => setYearFrom(e.target.value)} className="w-24" placeholder="From" />
            <span className="text-muted-foreground text-sm">–</span>
            <Input type="number" value={yearTo} onChange={e => setYearTo(e.target.value)} className="w-24" placeholder="To" />
          </div>
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset
          </Button>
        </div>

        {/* KPI Row */}
        <div data-tour="kpi-row" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Total Faculty" value={filteredFaculty.length} icon={Users} />
          <KpiCard title="Participating Faculty" value={`${participatingPct}%`} icon={UserCheck} variant="success" />
          <KpiCard title="Verified ICs" value={verified.length} icon={CheckCircle} variant="success" />
          <KpiCard title="Q1 Publications" value={q1.length} icon={TrendingUp} variant="success" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Total PRJs" value={prjs.length} icon={FileText} />
          <KpiCard title="Under Review" value={underReview.length} icon={Clock} variant="warning" />
          <KpiCard title="Rejected" value={rejected.length} icon={XCircle} variant="destructive" />
          <KpiCard title="Avg ICs/Faculty" value={filteredFaculty.length ? (ics.length / filteredFaculty.length).toFixed(1) : '0'} icon={BookOpen} />
        </div>

        {/* AACSB Classification & Participation Statistics */}
        <div data-tour="aacsb-stats" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Classification Donut */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-base">Faculty Classification Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {classificationData.length > 0 ? (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-center">
                  <div className="min-w-0">
                    <div className="h-[260px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                          <Pie data={classificationData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={84} paddingAngle={2}>
                            {classificationData.map((entry) => (
                              <Cell key={entry.name} fill={CLASSIFICATION_COLORS[entry.name] || 'hsl(var(--muted))'} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value, _name, item) => [`${value} faculty (${item.payload.pct}%)`, item.payload.name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm min-w-0">
                    {classificationData.map(d => (
                      <div key={d.name} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: CLASSIFICATION_COLORS[d.name] || 'hsl(var(--muted))' }} />
                          <span className="font-medium">{d.name}</span>
                        </div>
                        <span className="shrink-0 text-muted-foreground">{d.value} ({d.pct}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No classification data available. Import faculty data with AACSB classifications.</p>
              )}
            </CardContent>
          </Card>

          {/* Participation Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-base">Participating Faculty</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-5xl font-bold text-primary">{participatingPct}%</p>
                  <p className="text-sm text-muted-foreground mt-1">Participating</p>
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Participating</span>
                      <span className="font-medium">{participatingCount}</span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${participatingPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Supporting</span>
                      <span className="font-medium">{filteredFaculty.filter(f => (f as any).faculty_sufficiency === 'Supporting').length}</span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-chart-3 rounded-full transition-all" style={{ width: `${filteredFaculty.length ? ((filteredFaculty.filter(f => (f as any).faculty_sufficiency === 'Supporting').length / filteredFaculty.length) * 100) : 0}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Unclassified</span>
                      <span className="font-medium">{filteredFaculty.filter(f => !(f as any).faculty_sufficiency).length}</span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-muted-foreground/30 rounded-full transition-all" style={{ width: `${filteredFaculty.length ? ((filteredFaculty.filter(f => !(f as any).faculty_sufficiency).length / filteredFaculty.length) * 100) : 0}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {hasData && (
          <div data-tour="charts" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="font-serif text-base">5-Year Trend Analysis</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={yearData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="year" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ fill: CHART_COLORS[0] }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="font-serif text-base">IC Category Distribution (Verified)</CardTitle></CardHeader>
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

              <Card>
                <CardHeader><CardTitle className="font-serif text-base">Quartile Distribution</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
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

              <Card>
                <CardHeader><CardTitle className="font-serif text-base">ICs by Department</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={deptData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" fontSize={11} angle={-15} textAnchor="end" height={50} />
                      <YAxis fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Publications per Faculty Member */}
            <Card>
              <CardHeader><CardTitle className="font-serif text-base">Publications per Faculty Member</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Faculty</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">IC Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {perFacultyData.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell>{row.department}</TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!hasData && (
          <Card>
            <CardContent className="py-16 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="font-serif text-lg text-foreground mb-2">No Data Available Yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                To begin, import faculty profiles and intellectual contributions using the Import Center,
                or wait for faculty members to submit their records.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default MasterDashboardPage;
