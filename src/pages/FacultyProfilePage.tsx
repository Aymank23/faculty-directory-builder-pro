import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { User, GraduationCap, Briefcase, Heart, Award, Upload, Pencil, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { departments, campuses, academicRanks, ftPtStatuses, highestDegrees, tenureStatuses } from '@/lib/constants';
import { normalizeDepartment } from '@/lib/normalize';
import { repairQualification } from '@/lib/qualifications';
import { repairService } from '@/lib/services';
import { repairEngagement } from '@/lib/engagements';
import { cleanCvValue } from '@/lib/cvNoise';
import CvSectionCard from '@/components/CvSectionCard';
import CvArchiveCard from '@/components/CvArchiveCard';



const FacultyProfilePage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('faculty_profiles').select('*').eq('user_id', user!.id)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const facultyId = profile?.faculty_id;

  // CV Section 2
  const { data: qualifications = [] } = useQuery({
    queryKey: ['my-qualifications', facultyId],
    queryFn: async () => {
      const { data } = await supabase.from('academic_qualifications').select('*').eq('faculty_id', facultyId!).order('year', { ascending: false });
      return (data || []).map((row: any) => ({ ...row, ...repairQualification(row) }));
    },
    enabled: !!facultyId,
  });
  const { data: ics = [] } = useQuery({
    queryKey: ['my-ics', facultyId],
    queryFn: async () => {
      const { data } = await supabase.from('intellectual_contributions').select('*').eq('faculty_id', facultyId!).order('year', { ascending: false });
      return data || [];
    },
    enabled: !!facultyId,
  });

  const { data: engagements = [] } = useQuery({
    queryKey: ['my-engagements', facultyId],
    queryFn: async () => {
      const { data } = await supabase.from('professional_engagements').select('*').eq('faculty_id', facultyId!).order('created_at', { ascending: false });
      return (data || []).map((row: any) => ({ ...row, ...repairEngagement(row) }));
    },
    enabled: !!facultyId,
  });
  const { data: experience = [] } = useQuery({
    queryKey: ['my-experience', facultyId],
    queryFn: async () => {
      const { data } = await supabase.from('professional_experience').select('*').eq('faculty_id', facultyId!).order('created_at', { ascending: false });
      return (data || []).map((row: any) => ({
        ...row,
        position_title: cleanCvValue(row.position_title),
        organization: cleanCvValue(row.organization),
        period: cleanCvValue(row.period),
        key_responsibilities: cleanCvValue(row.key_responsibilities),
      }));
    },
    enabled: !!facultyId,
  });
  const { data: services = [] } = useQuery({
    queryKey: ['my-services', facultyId],
    queryFn: async () => {
      const { data } = await supabase.from('service_contributions').select('*').eq('faculty_id', facultyId!).order('created_at', { ascending: false });
      return (data || []).map((row: any) => ({ ...row, ...repairService(row) }));
    },
    enabled: !!facultyId,
  });
  const { data: awards = [] } = useQuery({
    queryKey: ['my-awards', facultyId],
    queryFn: async () => {
      const { data } = await supabase.from('awards_recognition').select('*').eq('faculty_id', facultyId!).order('year', { ascending: false });
      return (data || []).map((row: any) => ({
        ...row,
        award: cleanCvValue(row.award),
        award_name: cleanCvValue(row.award_name),
        institution_organization: cleanCvValue(row.institution_organization),
      }));
    },
    enabled: !!facultyId,
  });

  useEffect(() => {
    if (profile && editOpen) {
      setForm({
        first_name: profile.first_name || '', last_name: profile.last_name || '', middle_names: profile.middle_names || '',
        title: profile.title || '', employee_id: profile.employee_id || '',
        department: profile.department || '', campus: profile.campus || '',
        academic_rank: profile.academic_rank || '', admin_title: profile.admin_title || '',
        ft_pt_status: profile.ft_pt_status || '', email: profile.email || '',
        tenure_status: profile.tenure_status || '',
        highest_degree: profile.highest_degree || '', highest_degree_date: profile.highest_degree_date || '',
        degree_major: profile.degree_major || '', degree_institution: profile.degree_institution || '',
        degree_country: profile.degree_country || '', date_joining_aksob: profile.date_joining_aksob || '',
        discipline_program: profile.discipline_program || '',
        discipline: profile.discipline || '',
      });
    }
  }, [profile, editOpen]);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    const updates: any = {};
    Object.entries(form).forEach(([k, v]) => {
      let trimmed: any = (v as string)?.trim() || null;
      // Canonicalize department aliases on save (MKT → Marketing, MGT → Management, …)
      if (k === 'department' && trimmed) {
        const canon = normalizeDepartment(trimmed);
        trimmed = canon === 'N/A' ? null : canon;
      }
      updates[k] = trimmed;
    });
    updates.updated_at = new Date().toISOString();
    const { error } = await supabase.from('faculty_profiles').update(updates).eq('faculty_id', profile.faculty_id);
    if (error) { toast.error(`Save failed: ${error.message}`); setSavingProfile(false); return; }
    await supabase.from('audit_log').insert({
      user_id: user!.id, action: 'profile_edited',
      target_table: 'faculty_profiles', target_record: profile.faculty_id,
      details: { fields: Object.keys(updates).filter(k => k !== 'updated_at') },
    });
    toast.success('Profile updated');
    setEditOpen(false);
    setSavingProfile(false);
    queryClient.invalidateQueries({ queryKey: ['my-profile'] });
  };

  const fields = [
    { label: 'Full Name', value: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '' },
    { label: 'Employee ID', value: profile?.employee_id },
    { label: 'Title', value: profile?.title },
    { label: 'Email', value: profile?.email },
    { label: 'FT/PT Status', value: profile?.ft_pt_status },
    { label: 'Academic Rank', value: profile?.academic_rank },
    { label: 'Tenure Status', value: profile?.tenure_status },
    { label: 'Highest Degree', value: profile?.highest_degree },
    { label: 'Degree Date', value: profile?.highest_degree_date },
    { label: 'Degree Major', value: profile?.degree_major },
    { label: 'Degree Institution', value: profile?.degree_institution },
    { label: 'Department', value: profile?.department },
    { label: 'Discipline (AACSB)', value: profile?.discipline },
    { label: 'Campus', value: profile?.campus },
    { label: 'Discipline / Program', value: profile?.discipline_program },
    { label: 'Date Joining AKSOB', value: profile?.date_joining_aksob },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-serif text-foreground">My Profile</h1>
            <p className="text-sm text-muted-foreground">Your academic and personal information (CV Sections 1–6)</p>
          </div>
          {profile && (
            <Button asChild variant="outline">
              <Link to="/upload-cv">
                <Upload className="h-4 w-4 mr-2" /> Go to Upload CV
              </Link>
            </Button>
          )}
        </div>

        {/* Section 1: Personal & Academic */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-muted text-primary"><User className="h-5 w-5" /></div>
                <div>
                  <CardTitle className="font-serif text-base">1. Personal & Academic Information</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Click Edit to correct any inaccuracies</p>
                </div>
              </div>
              {profile && (
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading profile...</p>
            ) : !profile ? (
              <div className="text-center py-8">
                <User className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No profile record found. Upload a CV or contact your administrator.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fields.map(f => (
                  <div key={f.label} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{f.label}</p>
                    <p className="text-sm text-foreground">{f.value || <Badge variant="outline" className="text-xs">Not set</Badge>}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit profile dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-serif">Edit Profile</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              {[
                { k: 'first_name', l: 'First Name' },
                { k: 'last_name', l: 'Last Name' },
                { k: 'middle_names', l: 'Middle Names' },
                { k: 'title', l: 'Title (Dr., Prof., Mr., …)' },
                { k: 'employee_id', l: 'Employee ID' },
                { k: 'email', l: 'Email' },
              ].map(f => (
                <div key={f.k} className="space-y-2">
                  <Label>{f.l}</Label>
                  <Input value={form[f.k] || ''} onChange={e => setForm({ ...form, [f.k]: e.target.value })} />
                </div>
              ))}
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={form.department || ''} onValueChange={v => setForm({ ...form, department: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Campus</Label>
                <Select value={form.campus || ''} onValueChange={v => setForm({ ...form, campus: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{campuses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Academic Rank</Label>
                <Select value={form.academic_rank || ''} onValueChange={v => setForm({ ...form, academic_rank: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{academicRanks.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Admin Title</Label>
                <Input value={form.admin_title || ''} onChange={e => setForm({ ...form, admin_title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>FT/PT Status</Label>
                <Select value={form.ft_pt_status || ''} onValueChange={v => setForm({ ...form, ft_pt_status: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{ftPtStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tenure Status</Label>
                <Select value={form.tenure_status || ''} onValueChange={v => setForm({ ...form, tenure_status: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{tenureStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Highest Degree</Label>
                <Select value={form.highest_degree || ''} onValueChange={v => setForm({ ...form, highest_degree: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{highestDegrees.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {[
                { k: 'highest_degree_date', l: 'Highest Degree Date' },
                { k: 'degree_major', l: 'Degree Major' },
                { k: 'degree_institution', l: 'Degree Institution' },
                { k: 'degree_country', l: 'Degree Country' },
                { k: 'date_joining_aksob', l: 'Date Joining AKSOB' },
                { k: 'discipline_program', l: 'Discipline / Program' },
                { k: 'discipline', l: 'Discipline (AACSB code: MGT/ECO/FIN/MKT/ACC/HTM/ITM)' },
              ].map(f => (
                <div key={f.k} className="space-y-2">
                  <Label>{f.l}</Label>
                  <Input value={form[f.k] || ''} onChange={e => setForm({ ...form, [f.k]: e.target.value })} />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveProfile} disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save Changes'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Section 2: Academic & Professional Qualifications */}
        {profile && (
          <CvSectionCard
            title="2. Academic & Professional Qualifications"
            icon={GraduationCap}
            columns={['Degree / Certification', 'Institution', 'Year', 'Field / Area']}
            rows={qualifications}
            renderRow={(q: any) => [q.degree_certification, q.institution, q.year, q.field_area]}
            emptyText="No qualifications recorded."
            tableName="academic_qualifications"
            facultyId={facultyId!}
            userId={user!.id}
            queryKey="my-qualifications"
            formFields={[
              { name: 'degree_certification', label: 'Degree / Certification', required: true },
              { name: 'institution', label: 'Institution' },
              { name: 'year', label: 'Year', type: 'number' },
              { name: 'field_area', label: 'Field / Area' },
            ]}
          />
        )}

        {/* Section 3: Intellectual Contributions */}
        {profile && (
          <CvSectionCard
            title="3. Intellectual Contributions"
            icon={BookOpen}
            columns={['Title', 'Authors', 'Year', 'Journal / Outlet', 'Type', 'Quartile']}
            rows={ics}
            renderRow={(ic: any) => [ic.title, ic.authors, ic.year, ic.journal_outlet, ic.ic_type, ic.quartile]}
            emptyText="No intellectual contributions recorded."
            tableName="intellectual_contributions"
            facultyId={facultyId!}
            userId={user!.id}
            queryKey="my-ics"
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
        )}

        {/* Section 4: Professional Engagement Activities */}
        {profile && (
          <CvSectionCard
            title="4. Professional Engagement Activities"
            icon={Briefcase}
            columns={['From-To', 'Activity', 'Details']}
            rows={engagements}
            renderRow={(e: any) => [e.from_to, e.activity, e.details]}
            emptyText="No professional engagements recorded."
            tableName="professional_engagements"
            facultyId={facultyId!}
            userId={user!.id}
            queryKey="my-engagements"
            formFields={[
              { name: 'from_to', label: 'From-To (e.g. 2022–2024)' },
              { name: 'activity', label: 'Activity', required: true },
              { name: 'engagement_type', label: 'Engagement Type' },
              { name: 'details', label: 'Details', type: 'textarea' },
            ]}
          />
        )}

        {/* Section 5: Service Contributions */}
        {profile && (
          <CvSectionCard
            title="5. Service Contributions"
            icon={Heart}
            columns={['From-To', 'Level', 'Committee / Role']}
            rows={services}
            renderRow={(s: any) => [s.from_to, s.level, s.committee_role]}
            emptyText="No service contributions recorded."
            tableName="service_contributions"
            facultyId={facultyId!}
            userId={user!.id}
            queryKey="my-services"
            formFields={[
              { name: 'from_to', label: 'From-To (e.g. 2021–Present)' },
              { name: 'level', label: 'Level (e.g. Department, School, University)' },
              { name: 'committee_role', label: 'Committee / Role', required: true },
              { name: 'contribution_type', label: 'Contribution Type' },
              { name: 'description', label: 'Description', type: 'textarea' },
            ]}
          />
        )}

        {/* Section 6: Awards & Recognition */}
        {profile && (
          <CvSectionCard
            title="6. Awards & Recognition"
            icon={Award}
            columns={['Year', 'Award / Recognition', 'Institution / Organization']}
            rows={awards}
            renderRow={(a: any) => [a.year, a.award, a.institution_organization]}
            emptyText="No awards recorded."
            tableName="awards_recognition"
            facultyId={facultyId!}
            userId={user!.id}
            queryKey="my-awards"
            formFields={[
              { name: 'year', label: 'Year', type: 'number' },
              { name: 'award', label: 'Award / Recognition', required: true },
              { name: 'institution_organization', label: 'Institution / Organization' },
            ]}
          />
        )}

        {/* Additional: Professional Experience */}
        {profile && (
          <CvSectionCard
            title="Professional Experience"
            icon={Briefcase}
            columns={['Period', 'Position', 'Organization', 'Key Responsibilities']}
            rows={experience}
            renderRow={(x: any) => [x.period, x.position_title, x.organization, x.key_responsibilities]}
            emptyText="No professional experience recorded."
            tableName="professional_experience"
            facultyId={facultyId!}
            userId={user!.id}
            queryKey="my-experience"
            formFields={[
              { name: 'period', label: 'Period (e.g. 2018–2022)' },
              { name: 'position_title', label: 'Position Title', required: true },
              { name: 'organization', label: 'Organization' },
              { name: 'key_responsibilities', label: 'Key Responsibilities', type: 'textarea' },
            ]}
          />
        )}

        {facultyId && <CvArchiveCard facultyId={facultyId} title="My Uploaded CVs" />}

      </div>

    </AppLayout>
  );
};




export default FacultyProfilePage;
