import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import DashboardTour from '@/components/DashboardTour';
import KpiCard from '@/components/KpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { FileText, BookOpen, BarChart3, TrendingUp, Award, Upload, Trophy } from 'lucide-react';

const statusVariant = (s: string) => {
  if (s === 'verified') return 'default' as const;
  if (s === 'under_review') return 'secondary' as const;
  if (s === 'rejected') return 'destructive' as const;
  return 'outline' as const;
};

const FacultyOverviewPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('faculty_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: ics = [] } = useQuery({
    queryKey: ['my-ics', profile?.faculty_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('intellectual_contributions')
        .select('*')
        .eq('faculty_id', profile!.faculty_id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!profile,
  });

  const { data: teaching = [] } = useQuery({
    queryKey: ['my-teaching', profile?.faculty_id],
    queryFn: async () => {
      const { data } = await supabase.from('teaching_load').select('*').eq('faculty_id', profile!.faculty_id);
      return data || [];
    },
    enabled: !!profile,
  });

  const prjs = ics.filter(ic => ic.ic_type === 'PRJ').length;
  const q1 = ics.filter(ic => ic.quartile === 'Q1').length;
  const q2 = ics.filter(ic => ic.quartile === 'Q2').length;
  const q3 = ics.filter(ic => ic.quartile === 'Q3').length;
  const q4 = ics.filter(ic => ic.quartile === 'Q4').length;

  // Recent contributions: newest first by created_at, fall back to year
  const recentIcs = [...ics]
    .sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      if (tb !== ta) return tb - ta;
      return (b.year || 0) - (a.year || 0);
    })
    .slice(0, 5);

  const goRepo = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    navigate(`/repository?${qs}`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">Welcome, {user?.full_name}</h1>
            <p className="text-sm text-muted-foreground">Your faculty portfolio overview</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/upload-cv">
                <Upload className="h-4 w-4 mr-2" /> Upload CV
              </Link>
            </Button>
            <DashboardTour
              storageKey="tour-faculty-overview"
              steps={[
                { target: '[data-tour="kpi-row"]', title: 'Your Metrics', description: 'Click any card to drill into the matching contributions in your repository.' },
                { target: '[data-tour="quartiles"]', title: 'Quartile Breakdown', description: 'Q1–Q4 publication counts. Click a card to filter the repository by quartile.' },
                { target: '[data-tour="recent"]', title: 'Recent Contributions', description: 'Your latest intellectual contributions, sorted by upload date.' },
              ]}
            />
          </div>
        </div>

        {/* Primary KPIs — all clickable */}
        <div data-tour="kpi-row" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button type="button" onClick={() => navigate('/repository')} className="text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <KpiCard title="Total ICs" value={ics.length} icon={FileText} />
          </button>
          <button type="button" onClick={() => goRepo({ type: 'PRJ' })} className="text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <KpiCard title="Total PRJs" value={prjs} icon={BookOpen} />
          </button>
          <button type="button" onClick={() => goRepo({ quartile: 'Q1' })} className="text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <KpiCard title="Q1 Publications" value={q1} icon={TrendingUp} variant="success" />
          </button>
          <button type="button" onClick={() => navigate('/teaching-load')} className="text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <KpiCard title="Courses This Year" value={teaching.length} icon={Award} />
          </button>
        </div>

        {/* Quartile Breakdown — Q1/Q2/Q3/Q4 */}
        <div data-tour="quartiles" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button type="button" onClick={() => goRepo({ quartile: 'Q1' })} className="text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <KpiCard title="Q1" value={q1} icon={Trophy} variant="success" />
          </button>
          <button type="button" onClick={() => goRepo({ quartile: 'Q2' })} className="text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <KpiCard title="Q2" value={q2} icon={Trophy} />
          </button>
          <button type="button" onClick={() => goRepo({ quartile: 'Q3' })} className="text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <KpiCard title="Q3" value={q3} icon={Trophy} variant="warning" />
          </button>
          <button type="button" onClick={() => goRepo({ quartile: 'Q4' })} className="text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
            <KpiCard title="Q4" value={q4} icon={Trophy} variant="warning" />
          </button>
        </div>

        {/* Recent Contributions */}
        {recentIcs.length > 0 && (
          <Card data-tour="recent">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-base">Recent Contributions</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/repository">View all <BarChart3 className="h-3.5 w-3.5 ml-1" /></Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Quartile</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentIcs.map(ic => (
                    <TableRow key={ic.ic_id} onClick={() => navigate('/repository')} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium max-w-xs truncate">{ic.title}</TableCell>
                      <TableCell>{ic.ic_type || '—'}</TableCell>
                      <TableCell>{ic.year || '—'}</TableCell>
                      <TableCell>{ic.quartile || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(ic.status)} className="capitalize text-xs">
                          {ic.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {ics.length === 0 && teaching.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="font-serif text-lg text-foreground mb-2">Getting Started</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Your portfolio is currently empty. Add your first intellectual contribution using the "Add Contribution" page,
                or upload your CV to auto-populate everything.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default FacultyOverviewPage;
