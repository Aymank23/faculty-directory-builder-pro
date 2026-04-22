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

const VALID_IC_TYPES = new Set(['PRJ', 'Book', 'Chapter']);

const AdminFacultyProfilePage = () => {
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
    queryFn: async () => (await supabase.from('professional_engagements').select('*').eq('faculty_id', id!)).data || [],
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
    queryFn: async () => (await supabase.from('awards_recognition').select('*').eq('faculty_id', id!).order('year', { ascending: false })).data || [],
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
              {[profile.academic_rank, normalizeDepartment(profile.department), profile.campus].filter(v => v && v !== 'N/A').join(' · ')}
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

        <Card>
          <CardHeader><CardTitle className="font-serif text-base flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> Intellectual Contributions ({validIcs.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {validIcs.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">No valid intellectual contributions.</p>
            ) : (
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
                  {validIcs.map(ic => (
                    <TableRow key={ic.ic_id}>
                      <TableCell className="font-medium max-w-xl truncate">{ic.title || '—'}</TableCell>
                      <TableCell>{ic.ic_type || '—'}</TableCell>
                      <TableCell>{ic.year || '—'}</TableCell>
                      <TableCell>{ic.quartile || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize text-xs">{(ic.status || '').replace('_', ' ')}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <SectionTable title="Academic & Professional Qualifications" icon={GraduationCap} rows={qualifications} columns={['Degree', 'Institution', 'Year', 'Field/Area']} render={(q: any) => [q.degree_certification, q.institution, q.year, q.field_area]} />
        <SectionTable title="Professional Engagement Activities" icon={Briefcase} rows={engagements} columns={['From-To', 'Activity', 'Details']} render={(e: any) => [e.from_to, e.activity, e.details]} />
        <SectionTable title="Service Contributions" icon={Heart} rows={services} columns={['From-To', 'Level', 'Committee/Role']} render={(s: any) => [s.from_to, s.level, s.committee_role]} />
        <SectionTable title="Awards & Recognition" icon={Award} rows={awards} columns={['Year', 'Award', 'Institution']} render={(a: any) => [a.year, a.award, a.institution_organization]} />
      </div>
    </AppLayout>
  );
};

const SectionTable = ({ title, icon: Icon, rows, columns, render }: { title: string; icon: any; rows: any[]; columns: string[]; render: (row: any) => any[] }) => (
  <Card>
    <CardHeader><CardTitle className="font-serif text-base flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /> {title} ({rows.length})</CardTitle></CardHeader>
    <CardContent className="p-0">
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground text-center">No entries.</p>
      ) : (
        <Table>
          <TableHeader><TableRow>{columns.map(c => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id || r.ic_id || i}>
                {render(r).map((cell, j) => <TableCell key={j} className="text-sm">{cell || '—'}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);

export default AdminFacultyProfilePage;
