import { useParams, Link, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import FacultyDashboard from '@/components/v2/FacultyDashboard';

// Admin / HoD view of the SAME Individual Faculty Dashboard faculty see — no duplicate profile.
const AdminFacultyProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: profile, isLoading } = useQuery({
    queryKey: ['admin-faculty-profile', id],
    queryFn: async () => (await supabase.from('faculty_profiles').select('*').eq('faculty_id', id!).maybeSingle()).data,
    enabled: !!id,
  });

  const back = (
    <Button variant="outline" size="sm" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard'))}>
      <ArrowLeft className="h-4 w-4 mr-2" /> Back
    </Button>
  );

  if (isLoading) return <AppLayout><p className="text-sm text-muted-foreground">Loading…</p></AppLayout>;
  if (!profile) {
    return <AppLayout><div className="space-y-4">{back}<p className="text-sm text-muted-foreground">Faculty not found. <Link to="/dashboard" className="underline">Master Dashboard</Link></p></div></AppLayout>;
  }

  const name = [profile.title, profile.first_name, profile.middle_names, profile.last_name].filter(Boolean).join(' ');
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          {back}
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">{name}</h1>
            <p className="text-sm text-muted-foreground">Individual Faculty Dashboard</p>
          </div>
        </div>
        <FacultyDashboard profile={profile} archiveTitle="Uploaded CVs (archive)" />
      </div>
    </AppLayout>
  );
};

export default AdminFacultyProfilePage;
