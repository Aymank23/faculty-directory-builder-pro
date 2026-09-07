import AppLayout from '@/components/AppLayout';
import DashboardTour from '@/components/DashboardTour';
import KpiCard from '@/components/KpiCard';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, FileText, CheckCircle, Clock } from 'lucide-react';
import { normalizeDepartment } from '@/lib/normalize';
import { icStats } from '@/lib/icMetrics';


const DepartmentOverviewPage = () => {
  const { user } = useAuth();
  const userDept = user?.department ? normalizeDepartment(user.department) : '';

  // Fetch all faculty and filter client-side via canonical department label so
  // legacy aliases (MKT, MGT, FINA, ITOM, …) resolve to the user's department.
  const { data: deptFaculty = [] } = useQuery({
    queryKey: ['dept-faculty', userDept],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*');
      return (data || []).filter(f => normalizeDepartment(f.department) === userDept);
    },
    enabled: !!userDept,
  });

  const facultyIds = deptFaculty.map(f => f.faculty_id);

  const { data: ics = [] } = useQuery({
    queryKey: ['dept-ics', facultyIds],
    queryFn: async () => {
      if (facultyIds.length === 0) return [];
      const { data } = await supabase.from('intellectual_contributions').select('*').in('faculty_id', facultyIds).eq('record_class', 'ic');
      return data || [];
    },
    enabled: facultyIds.length > 0,
  });

  const stats = icStats(ics);
  const verified = stats.verified.length;
  const pending = stats.underReview.length;


  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">Department Overview</h1>
            <p className="text-sm text-muted-foreground">{user?.department} — Portfolio summary</p>
          </div>
          <DashboardTour
            storageKey="tour-dept-overview"
            steps={[
              { target: '[data-tour="kpi-row"]', title: 'Department Metrics', description: 'Faculty count, total ICs, verified contributions, and items pending your review.' },
            ]}
          />
        </div>

        <div data-tour="kpi-row" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Faculty Members" value={deptFaculty.length} icon={Users} />
          <KpiCard title="Total ICs" value={stats.allIcRecords.length} icon={FileText} />
          <KpiCard title="Verified" value={verified} icon={CheckCircle} variant="success" />
          <KpiCard title="Pending Review" value={pending} icon={Clock} variant="warning" />
        </div>

        {deptFaculty.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="font-serif text-lg text-foreground mb-2">No Faculty Records</h3>
              <p className="text-sm text-muted-foreground">No faculty profiles found for {user?.department}. Contact the system administrator to import faculty data.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default DepartmentOverviewPage;
