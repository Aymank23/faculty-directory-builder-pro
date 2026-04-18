import { useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { User, GraduationCap, Briefcase, Heart, Award, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

const FacultyProfilePage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const facultyId = profile?.faculty_id;

  // CV Section 2: Academic Qualifications
  const { data: qualifications = [] } = useQuery({
    queryKey: ['my-qualifications', facultyId],
    queryFn: async () => {
      const { data } = await supabase.from('academic_qualifications').select('*').eq('faculty_id', facultyId!).order('year', { ascending: false });
      return data || [];
    },
    enabled: !!facultyId,
  });

  // CV Section 4: Professional Engagements
  const { data: engagements = [] } = useQuery({
    queryKey: ['my-engagements', facultyId],
    queryFn: async () => {
      const { data } = await supabase.from('professional_engagements').select('*').eq('faculty_id', facultyId!).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!facultyId,
  });

  // CV Section 5: Service Contributions
  const { data: services = [] } = useQuery({
    queryKey: ['my-services', facultyId],
    queryFn: async () => {
      const { data } = await supabase.from('service_contributions').select('*').eq('faculty_id', facultyId!).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!facultyId,
  });

  // CV Section 6: Awards
  const { data: awards = [] } = useQuery({
    queryKey: ['my-awards', facultyId],
    queryFn: async () => {
      const { data } = await supabase.from('awards_recognition').select('*').eq('faculty_id', facultyId!).order('year', { ascending: false });
      return data || [];
    },
    enabled: !!facultyId,
  });

  const fields = [
    { label: 'Full Name', value: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '' },
    { label: 'Employee ID', value: profile?.employee_id },
    { label: 'FT/PT Status', value: profile?.ft_pt_status },
    { label: 'Academic Rank', value: profile?.academic_rank },
    { label: 'Highest Degree', value: profile?.highest_degree },
    { label: 'Degree Date', value: profile?.highest_degree_date },
    { label: 'Department', value: profile?.department },
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
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-muted text-primary"><User className="h-5 w-5" /></div>
              <div>
                <CardTitle className="font-serif text-base">1. Personal & Academic Information</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Contact your administrator for profile updates</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading profile...</p>
            ) : !profile ? (
              <div className="text-center py-8">
                <User className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No profile record found. Please contact your administrator.</p>
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

        {/* Section 2: Academic & Professional Qualifications */}
        {profile && (
          <CvSection
            title="2. Academic & Professional Qualifications"
            icon={GraduationCap}
            columns={['Degree / Certification', 'Institution', 'Year', 'Field / Area']}
            rows={qualifications}
            renderRow={(q: any) => [q.degree_certification, q.institution || '—', q.year || '—', q.field_area || '—']}
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

        {/* Section 4: Professional Engagement Activities */}
        {profile && (
          <CvSection
            title="4. Professional Engagement Activities"
            icon={Briefcase}
            columns={['From-To', 'Activity', 'Details']}
            rows={engagements}
            renderRow={(e: any) => [e.from_to || '—', e.activity, e.details || '—']}
            emptyText="No professional engagements recorded."
            tableName="professional_engagements"
            facultyId={facultyId!}
            userId={user!.id}
            queryKey="my-engagements"
            formFields={[
              { name: 'from_to', label: 'From-To (e.g. 2022–2024)' },
              { name: 'activity', label: 'Activity', required: true },
              { name: 'details', label: 'Details' },
            ]}
          />
        )}

        {/* Section 5: Service Contributions */}
        {profile && (
          <CvSection
            title="5. Service Contributions"
            icon={Heart}
            columns={['From-To', 'Level', 'Committee / Role']}
            rows={services}
            renderRow={(s: any) => [s.from_to || '—', s.level || '—', s.committee_role]}
            emptyText="No service contributions recorded."
            tableName="service_contributions"
            facultyId={facultyId!}
            userId={user!.id}
            queryKey="my-services"
            formFields={[
              { name: 'from_to', label: 'From-To (e.g. 2021–Present)' },
              { name: 'level', label: 'Level (e.g. Department, School, University)' },
              { name: 'committee_role', label: 'Committee / Role', required: true },
            ]}
          />
        )}

        {/* Section 6: Awards & Recognition */}
        {profile && (
          <CvSection
            title="6. Awards & Recognition"
            icon={Award}
            columns={['Year', 'Award / Recognition', 'Institution / Organization']}
            rows={awards}
            renderRow={(a: any) => [a.year || '—', a.award, a.institution_organization || '—']}
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
      </div>
    </AppLayout>
  );
};

// Reusable CV Section component
interface FormField {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
}

interface CvSectionProps {
  title: string;
  icon: any;
  columns: string[];
  rows: any[];
  renderRow: (row: any) => (string | number)[];
  emptyText: string;
  tableName: string;
  facultyId: string;
  userId: string;
  queryKey: string;
  formFields: FormField[];
}

const CvSection = ({ title, icon: Icon, columns, rows, renderRow, emptyText, tableName, facultyId, userId, queryKey, formFields }: CvSectionProps) => {
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const handleAdd = async () => {
    const required = formFields.filter(f => f.required);
    for (const rf of required) {
      if (!form[rf.name]?.trim()) { toast.error(`${rf.label} is required`); return; }
    }
    setSaving(true);
    const row: any = { faculty_id: facultyId };
    formFields.forEach(f => {
      const val = form[f.name]?.trim() || null;
      row[f.name] = f.type === 'number' && val ? parseInt(val) : val;
    });
    const { error } = await supabase.from(tableName as any).insert(row as any);
    if (error) { toast.error('Failed to add entry'); setSaving(false); return; }
    await supabase.from('audit_log').insert({ user_id: userId, action: `add_${tableName}`, target_table: tableName, details: row });
    toast.success('Entry added');
    setForm({});
    setAddOpen(false);
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  };

  const handleDelete = async (row: any) => {
    if (!confirm('Delete this entry?')) return;
    const { error } = await supabase.from(tableName as any).delete().eq('id', row.id);
    if (error) { toast.error('Delete failed'); return; }
    toast.success('Entry deleted');
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted text-primary"><Icon className="h-5 w-5" /></div>
            <CardTitle className="font-serif text-base">{title}</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map(c => <TableHead key={c}>{c}</TableHead>)}
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const cells = renderRow(row);
                return (
                  <TableRow key={row.id || i}>
                    {cells.map((cell, j) => <TableCell key={j} className="text-sm">{cell}</TableCell>)}
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(row)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif">Add Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {formFields.map(f => (
              <div key={f.name} className="space-y-2">
                <Label>{f.label}{f.required ? ' *' : ''}</Label>
                <Input
                  type={f.type || 'text'}
                  value={form[f.name] || ''}
                  onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default FacultyProfilePage;
