import { Link } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import DashboardTour from '@/components/DashboardTour';
import KpiCard from '@/components/KpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { FileText, BookOpen, BarChart3, TrendingUp, Award, Upload, Trophy, Info } from 'lucide-react';

import { icStats, verificationVariant, verificationLabel } from '@/lib/icMetrics';

const statusVariant = (ic: any) => verificationVariant(ic);


const FacultyOverviewPage = () => {
  const { user } = useAuth();

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

  // Recent contributions: only items from the last 3 years (by publication year),
  // sorted by upload time then year (newest first). Show up to 5.
  const currentYear = new Date().getFullYear();
  const recentIcs = [...ics]
    .filter(ic => (ic.year || 0) >= currentYear - 3)
    .sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      if (tb !== ta) return tb - ta;
      return (b.year || 0) - (a.year || 0);
    })
    .slice(0, 5);

  const sample = (list: typeof ics, n = 5) =>
    list.slice(0, n).map(ic => `${ic.title || 'Untitled'}${ic.year ? ` (${ic.year})` : ''}`);

  const prjSample = sample(ics.filter(ic => ic.ic_type === 'PRJ'));
  const q1Sample = sample(ics.filter(ic => ic.quartile === 'Q1'));
  const q2Sample = sample(ics.filter(ic => ic.quartile === 'Q2'));
  const q3Sample = sample(ics.filter(ic => ic.quartile === 'Q3'));
  const q4Sample = sample(ics.filter(ic => ic.quartile === 'Q4'));
  const allSample = sample(ics);
  const teachingSample = teaching
    .slice(0, 5)
    .map((t: any) => `${t.course_code || ''} ${t.course_title || ''}${t.term ? ` — ${t.term}` : ''}`.trim());

  // Wrap a KPI card with a hover tooltip on a small info icon (top-right).
  const KpiWithHover = ({
    title,
    value,
    icon,
    variant,
    tooltipTitle,
    tooltipLines,
  }: {
    title: string;
    value: number;
    icon: typeof FileText;
    variant?: 'default' | 'success' | 'warning' | 'destructive';
    tooltipTitle: string;
    tooltipLines: string[];
  }) => (
    <div className="relative">
      <KpiCard title={title} value={value} icon={icon} variant={variant} />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${title} details`}
            className="absolute top-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium mb-1">{tooltipTitle}</p>
          {tooltipLines.length === 0 ? (
            <p className="text-xs text-muted-foreground">No items yet.</p>
          ) : (
            <ul className="text-xs space-y-0.5">
              {tooltipLines.map((line, i) => (
                <li key={i} className="truncate">• {line}</li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );

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
                { target: '[data-tour="kpi-row"]', title: 'Your Metrics', description: 'Hover the info icon on any card to preview the matching contributions.' },
                { target: '[data-tour="quartiles"]', title: 'Quartile Breakdown', description: 'Q1–Q4 publication counts. Hover the icon to preview titles.' },
                { target: '[data-tour="recent"]', title: 'Recent Contributions', description: 'Your contributions from the last 3 years.' },
              ]}
            />
          </div>
        </div>

        {/* Primary KPIs — hover info icon to preview details */}
        <div data-tour="kpi-row" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiWithHover title="Total ICs" value={stats.allIcRecords.length} icon={FileText}
            tooltipTitle="Recent contributions" tooltipLines={allSample} />

          <KpiWithHover title="Total PRJs" value={prjs} icon={BookOpen}
            tooltipTitle="Peer-Reviewed Journals" tooltipLines={prjSample} />
          <KpiWithHover title="Q1 Publications" value={q1} icon={TrendingUp} variant="success"
            tooltipTitle="Q1 publications" tooltipLines={q1Sample} />
          <KpiWithHover title="Courses This Year" value={teaching.length} icon={Award}
            tooltipTitle="Teaching load" tooltipLines={teachingSample} />
        </div>

        {/* Quartile Breakdown — Q1/Q2/Q3/Q4 */}
        <div data-tour="quartiles" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiWithHover title="Q1" value={q1} icon={Trophy} variant="success"
            tooltipTitle="Q1 publications" tooltipLines={q1Sample} />
          <KpiWithHover title="Q2" value={q2} icon={Trophy}
            tooltipTitle="Q2 publications" tooltipLines={q2Sample} />
          <KpiWithHover title="Q3" value={q3} icon={Trophy} variant="warning"
            tooltipTitle="Q3 publications" tooltipLines={q3Sample} />
          <KpiWithHover title="Q4" value={q4} icon={Trophy} variant="warning"
            tooltipTitle="Q4 publications" tooltipLines={q4Sample} />
        </div>

        {/* Recent Contributions (last 3 years) */}
        {recentIcs.length > 0 && (
          <Card data-tour="recent">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-base">Recent Contributions (last 3 years)</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/my-repository">View all <BarChart3 className="h-3.5 w-3.5 ml-1" /></Link>
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
                    <TableRow key={ic.ic_id}>
                      <TableCell className="font-medium max-w-xs truncate">{ic.title}</TableCell>
                      <TableCell>{ic.ic_type || '—'}</TableCell>
                      <TableCell>{ic.year || '—'}</TableCell>
                      <TableCell>{ic.quartile || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(ic)} className="capitalize text-xs">
                          {verificationLabel(ic)}
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
