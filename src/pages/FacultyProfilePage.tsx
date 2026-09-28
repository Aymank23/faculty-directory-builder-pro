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
import { User, GraduationCap, Briefcase, Heart, Award, Upload, Pencil, BookOpen, Users } from 'lucide-react';
import { onlyIcs, onlyAcademicEngagement, verificationLabel } from '@/lib/icMetrics';
import { toast } from 'sonner';
import { departments, campuses, academicRanks, ftPtStatuses, highestDegrees, tenureStatuses } from '@/lib/constants';
import { normalizeDepartment } from '@/lib/normalize';
import { repairQualification } from '@/lib/qualifications';
import { repairService } from '@/lib/services';
import { repairEngagement } from '@/lib/engagements';
import { cleanCvValue } from '@/lib/cvNoise';
import FacultyDashboard from '@/components/v2/FacultyDashboard';



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

  // Section 3 shows research contributions only; section 4 shows Academic Engagement.
  const icRecords = onlyIcs(ics);
  const academicEngagementRecords = onlyAcademicEngagement(ics);

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
            <p className="text-sm text-muted-foreground">Individual Faculty Dashboard</p>
          </div>
          {profile && (
            <Button asChild variant="outline">
              <Link to="/upload-cv">
                <Upload className="h-4 w-4 mr-2" /> Go to Upload CV
              </Link>
            </Button>
          )}
        </div>

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

        {profile && <FacultyDashboard profile={profile} onEditProfile={() => setEditOpen(true)} archiveTitle="My Uploaded CVs" />}

      </div>

    </AppLayout>
  );
};




export default FacultyProfilePage;
