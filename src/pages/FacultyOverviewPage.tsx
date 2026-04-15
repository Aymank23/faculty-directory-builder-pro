import AppLayout from '@/components/AppLayout';
import DashboardTour from '@/components/DashboardTour';
import KpiCard from '@/components/KpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { FileText, CheckCircle, Clock, XCircle, BookOpen, BarChart3, TrendingUp, Award } from 'lucide-react';

const statusVariant = (s: string) => {
  if (s === 'verified') return 'default' as const;
  if (s === 'under_review') return 'secondary' as const;
  if (s === 'rejected') return 'destructive' as const;
  return 'outline' as const;
};

const FacultyOverviewPage = () => {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: ics = [] } = useQuery({
    queryKey: ['my-ics', profile?.faculty_id],
    queryFn: async () => {
      const { data } = await supabase.from('intellectual_contributions').select('*').eq('faculty_id', profile!.faculty_id);
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

  const verified = ics.filter(ic => ic.status === 'verified').length;
  const pending = ics.filter(ic => ic.status === 'under_review').length;
  const drafts = ics.filter(ic => ic.status === 'draft').length;
  const rejected = ics.filter(ic => ic.status === 'rejected').length;
  const prjs = ics.filter(ic => ic.ic_type === 'PRJ').length;
  const q1Count = ics.filter(ic => ic.quartile === 'Q1').length;

  // Recent contributions (last 5)
  const recentIcs = [...ics].sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()).slice(0, 5);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">Welcome, {user?.full_name}</h1>
            <p className="text-sm text-muted-foreground">Your faculty portfolio overview</p>
          </div>
          <DashboardTour
            storageKey="tour-faculty-overview"
            steps={[
              { target: '[data-tour="kpi-row"]', title: 'Your Metrics', description: 'Key numbers at a glance — total ICs, PRJs, Q1 publications, and pending approvals.' },
              { target: '[data-tour="recent"]', title: 'Recent Contributions', description: 'Your latest intellectual contributions with their current status.' },
            ]}
          />
        </div>

        {/* Primary KPIs */}
        <div data-tour="kpi-row" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Total ICs" value={ics.length} icon={FileText} />
          <KpiCard title="Total PRJs" value={prjs} icon={BookOpen} />
          <KpiCard title="Q1 Publications" value={q1Count} icon={TrendingUp} variant="success" />
          <KpiCard title="Pending Approvals" value={pending} icon={Clock} variant="warning" />
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Verified" value={verified} icon={CheckCircle} variant="success" />
          <KpiCard title="Drafts" value={drafts} icon={BarChart3} />
          <KpiCard title="Rejected" value={rejected} icon={XCircle} variant="destructive" />
          <KpiCard title="Courses This Year" value={teaching.length} icon={Award} />
        </div>

        {/* Recent Contributions */}
        {recentIcs.length > 0 && (
          <Card data-tour="recent">
            <CardHeader>
              <CardTitle className="font-serif text-base">Recent Contributions</CardTitle>
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
                    <TableRow key={ic.ic_id}>
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
                or contact your administrator to import your existing records.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default FacultyOverviewPage;
