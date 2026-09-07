import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { CHART_COLORS } from '@/lib/constants';
import { normalizeNA } from '@/lib/normalize';
import { onlyIcs } from '@/lib/icMetrics';

const MyAnalyticsPage = () => {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('faculty_profiles').select('*').eq('user_id', user!.id)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: icsRaw = [] } = useQuery({
    queryKey: ['my-ics', profile?.faculty_id],
    queryFn: async () => {
      const { data } = await supabase.from('intellectual_contributions').select('*').eq('faculty_id', profile!.faculty_id).eq('record_class', 'ic');
      return data || [];
    },
    enabled: !!profile,
  });

  // Only true Intellectual Contributions — Academic Engagement never counts here.
  const ics = onlyIcs(icsRaw);

  const yearCounts: Record<number, number> = {};
  ics.forEach(ic => { if (ic.year) yearCounts[ic.year] = (yearCounts[ic.year] || 0) + 1; });
  const yearData = Object.entries(yearCounts).sort().map(([year, count]) => ({ year, count }));

  const typeCounts: Record<string, number> = {};
  ics.forEach(ic => { const t = ic.ic_type || 'Other'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
  const typeData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

  const qCounts: Record<string, number> = {};
  ics.forEach(ic => { const q = normalizeNA(ic.quartile); qCounts[q] = (qCounts[q] || 0) + 1; });
  const qData = Object.entries(qCounts).map(([name, value]) => ({ name, value }));

  // Research split — bucket by canonical category, NOT free-text split-on-"/"
  const bucketCategory = (raw?: string | null): string => {
    if (!raw) return 'Uncategorized';
    const l = raw.toLowerCase();
    if (l.includes('basic') || l.includes('discovery')) return 'Basic / Discovery';
    if (l.includes('teaching') || l.includes('learning') || l.includes('pedagog')) return 'Teaching & Learning';
    if (l.includes('applied') || l.includes('integration') || l.includes('application')) return 'Applied / Integration';
    return 'Other';
  };
  const catCounts: Record<string, number> = {};
  ics.forEach(ic => { const c = bucketCategory(ic.ic_category); catCounts[c] = (catCounts[c] || 0) + 1; });
  const catData = Object.entries(catCounts).map(([name, value]) => ({ name, value }));

  if (ics.length === 0) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">My Analytics</h1>
            <p className="text-sm text-muted-foreground">Visualizations of your research portfolio</p>
          </div>
          <Card>
            <CardContent className="py-16 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="font-serif text-lg text-foreground mb-2">No Data to Display</h3>
              <p className="text-sm text-muted-foreground">Analytics will appear once you have intellectual contributions in your portfolio.</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">My Analytics</h1>
          <p className="text-sm text-muted-foreground">Visualizations of your research portfolio</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Research Split — Pie Chart (Doc Section 3) */}
          <Card>
            <CardHeader><CardTitle className="font-serif text-base">Research Split (Basic / Applied / Pedagogy)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {catData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Contribution Types — Bar Chart (Doc Section 3) */}
          <Card>
            <CardHeader><CardTitle className="font-serif text-base">Contribution Types</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={typeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Quality Trend — Publications per Year (Doc Section 3) */}
          <Card>
            <CardHeader><CardTitle className="font-serif text-base">Publications by Year</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
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

          {/* Quartile Distribution */}
          <Card>
            <CardHeader><CardTitle className="font-serif text-base">Quartile Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={qData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default MyAnalyticsPage;
