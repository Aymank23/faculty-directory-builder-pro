import { useParams, Link } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import KpiCard from '@/components/KpiCard';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, BookOpen, GraduationCap, Heart, Briefcase, Award } from 'lucide-react';
import { normalizeDepartment } from '@/lib/normalize';
import { repairQualification } from '@/lib/qualifications';
import { repairService } from '@/lib/services';
import { repairEngagement } from '@/lib/engagements';
import { cleanCvValue } from '@/lib/cvNoise';
import CvSectionCard from '@/components/CvSectionCard';
import { useAuth } from '@/contexts/AuthContext';


const VALID_IC_TYPES = new Set(['PRJ', 'Book', 'Chapter']);

const AdminFacultyProfilePage = () => {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();


  const { data: profile, isLoading } = useQuery({
    queryKey: ['admin-faculty-profile', id],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*').eq('faculty_id', id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: ics = [] } = useQuery({
    queryKey: ['admin-faculty-ics', id],
    queryFn: async () => {
      const { data } = await supabase.from('intellectual_contributions').select('*').eq('faculty_id', id!).order('year', { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: qualifications = [] } = useQuery({
    queryKey: ['admin-faculty-quals', id],
    queryFn: async () => {
      const { data } = await supabase.from('academic_qualifications').select('*').eq('faculty_id', id!).order('year', { ascending: false });
      return (data || []).map((row: any) => ({ ...row, ...repairQualification(row) }));
    },
    enabled: !!id,
  });
  const { data: engagements = [] } = useQuery({
    queryKey: ['admin-faculty-eng', id],
    queryFn: async () => {
      const { data } = await supabase.from('professional_engagements').select('*').eq('faculty_id', id!);
      return (data || []).map((row: any) => ({ ...row, ...repairEngagement(row) }));
    },
    enabled: !!id,
  });
  const { data: services = [] } = useQuery({
    queryKey: ['admin-faculty-svc', id],
    queryFn: async () => {
      const { data } = await supabase.from('service_contributions').select('*').eq('faculty_id', id!);
      return (data || []).map((row: any) => ({ ...row, ...repairService(row) }));
    },
    enabled: !!id,
  });
  const { data: awards = [] } = useQuery({
    queryKey: ['admin-faculty-awards', id],
    queryFn: async () => {
      const { data } = await supabase.from('awards_recognition').select('*').eq('faculty_id', id!).order('year', { ascending: false });
      return (data || []).map((row: any) => ({
        ...row,
        award: cleanCvValue(row.award),
        award_name: cleanCvValue(row.award_name),
        institution_organization: cleanCvValue(row.institution_organization),
      }));
    },
    enabled: !!id,
  });

  const validIcs = ics.filter(ic => VALID_IC_TYPES.has(ic.ic_type || ''));
  const prjs = validIcs.filter(ic => ic.ic_type === 'PRJ');
  const q1 = validIcs.filter(ic => ic.quartile === 'Q1');

  if (isLoading) {
    return <AppLayout><p className="text-sm text-muted-foreground">Loading…</p></AppLayout>;
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Button asChild variant="outline" size="sm"><Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> Back</Link></Button>
          <p className="text-sm text-muted-foreground">Faculty not found.</p>
        </div>
      </AppLayout>
    );
  }

  const fullName = [profile.first_name, profile.middle_names, profile.last_name].filter(Boolean).join(' ');

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
              <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> Back to dashboard</Link>
            </Button>
            <h1 className="text-2xl font-bold font-serif text-foreground">{fullName || '—'}</h1>
            <p className="text-sm text-muted-foreground">
              {[profile.academic_rank, normalizeDepartment(profile.department), profile.discipline, profile.campus].filter(v => v && v !== 'N/A').join(' · ')}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/faculty-directory?id=${profile.faculty_id}`}>Open in directory</Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="Valid ICs" value={validIcs.length} icon={BookOpen} />
          <KpiCard title="PRJs" value={prjs.length} icon={FileText} />
          <KpiCard title="Q1 Pubs" value={q1.length} icon={FileText} variant="success" />
          <KpiCard title="Verified" value={validIcs.filter(i => i.status === 'verified').length} icon={FileText} variant="success" />
        </div>

        <CvSectionCard
          title="2. Academic & Professional Qualifications"
          icon={GraduationCap}
          columns={['Degree / Certification', 'Institution', 'Year', 'Field / Area']}
          rows={qualifications}
          renderRow={(q: any) => [q.degree_certification, q.institution, q.year, q.field_area]}
          emptyText="No qualifications recorded."
          tableName="academic_qualifications"
          facultyId={profile.faculty_id}
          userId={user?.id || ''}
          queryKey="admin-faculty-quals"
          formFields={[
            { name: 'degree_certification', label: 'Degree / Certification', required: true },
            { name: 'institution', label: 'Institution' },
            { name: 'year', label: 'Year', type: 'number' },
            { name: 'field_area', label: 'Field / Area' },
          ]}
        />

        <CvSectionCard
          title="3. Intellectual Contributions"
          icon={BookOpen}
          columns={['Title', 'Authors', 'Year', 'Journal / Outlet', 'Type', 'Quartile', 'Status']}
          rows={ics}
          renderRow={(ic: any) => [ic.title, ic.authors, ic.year, ic.journal_outlet, ic.ic_type, ic.quartile, (ic.status || '').replace('_', ' ')]}
          emptyText="No intellectual contributions recorded."
          tableName="intellectual_contributions"
          facultyId={profile.faculty_id}
          userId={user?.id || ''}
          queryKey="admin-faculty-ics"
          pkField="ic_id"
          formFields={[
            { name: 'title', label: 'Title', required: true },
            { name: 'authors', label: 'Authors' },
            { name: 'year', label: 'Year', type: 'number' },
            { name: 'journal_outlet', label: 'Journal / Outlet' },
            { name: 'ic_type', label: 'IC Type (PRJ, Book, Chapter, …)' },
            { name: 'ic_category', label: 'IC Category' },
            { name: 'indexing_database', label: 'Indexing Database' },
            { name: 'quartile', label: 'Quartile (Q1–Q4)' },
            { name: 'abdc_rank', label: 'ABDC Rank' },
            { name: 'doi', label: 'DOI' },
            { name: 'apa_citation', label: 'APA Citation', type: 'textarea' },
          ]}
        />

        <CvSectionCard
          title="4. Professional Engagement Activities"
          icon={Briefcase}
          columns={['From-To', 'Activity', 'Details']}
          rows={engagements}
          renderRow={(e: any) => [e.from_to, e.activity, e.details]}
          emptyText="No professional engagements recorded."
          tableName="professional_engagements"
          facultyId={profile.faculty_id}
          userId={user?.id || ''}
          queryKey="admin-faculty-eng"
          formFields={[
            { name: 'from_to', label: 'From-To (e.g. 2022–2024)' },
            { name: 'activity', label: 'Activity', required: true },
            { name: 'engagement_type', label: 'Engagement Type' },
            { name: 'details', label: 'Details', type: 'textarea' },
          ]}
        />

        <CvSectionCard
          title="5. Service Contributions"
          icon={Heart}
          columns={['From-To', 'Level', 'Committee / Role']}
          rows={services}
          renderRow={(s: any) => [s.from_to, s.level, s.committee_role]}
          emptyText="No service contributions recorded."
          tableName="service_contributions"
          facultyId={profile.faculty_id}
          userId={user?.id || ''}
          queryKey="admin-faculty-svc"
          formFields={[
            { name: 'from_to', label: 'From-To (e.g. 2021–Present)' },
            { name: 'level', label: 'Level (e.g. Department, School, University)' },
            { name: 'committee_role', label: 'Committee / Role', required: true },
            { name: 'contribution_type', label: 'Contribution Type' },
            { name: 'description', label: 'Description', type: 'textarea' },
          ]}
        />

        <CvSectionCard
          title="6. Awards & Recognition"
          icon={Award}
          columns={['Year', 'Award / Recognition', 'Institution / Organization']}
          rows={awards}
          renderRow={(a: any) => [a.year, a.award, a.institution_organization]}
          emptyText="No awards recorded."
          tableName="awards_recognition"
          facultyId={profile.faculty_id}
          userId={user?.id || ''}
          queryKey="admin-faculty-awards"
          formFields={[
            { name: 'year', label: 'Year', type: 'number' },
            { name: 'award', label: 'Award / Recognition', required: true },
            { name: 'institution_organization', label: 'Institution / Organization' },
          ]}
        />
      </div>
    </AppLayout>
  );
};



export default AdminFacultyProfilePage;
