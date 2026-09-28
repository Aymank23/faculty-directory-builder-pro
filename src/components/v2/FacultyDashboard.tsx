import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Award, Briefcase, ChevronDown, GraduationCap, Heart, Pencil, User, Users, BookOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { repairQualification } from '@/lib/qualifications';
import { repairService } from '@/lib/services';
import { repairEngagement } from '@/lib/engagements';
import { cleanCvValue } from '@/lib/cvNoise';
import { onlyIcs, onlyAcademicEngagement, verificationLabel } from '@/lib/icMetrics';
import { fetchFacultyCanonical } from '@/lib/canonicalData';
import CvSectionCard from '@/components/CvSectionCard';
import CvArchiveCard from '@/components/CvArchiveCard';
import IcCanonicalTab from '@/components/v2/IcCanonicalTab';

type Props = { profile: any; onEditProfile?: () => void; archiveTitle?: string };

const yearOf = (v?: string | null) => String(v || '').match(/(19|20)\d{2}/)?.[0] || null;

export default function FacultyDashboard({ profile, onEditProfile, archiveTitle = 'Uploaded CVs' }: Props) {
  const { user } = useAuth();
  const fid = profile.faculty_id as string;
  const [tab, setTab] = useState('overview');
  const [pxOpen, setPxOpen] = useState(false);

  const q = (key: string, fn: () => Promise<any[]>) => useQuery({ queryKey: [key, fid], queryFn: fn });

  const { data: canonical } = useQuery({ queryKey: ['v2-faculty-ics', fid], queryFn: () => fetchFacultyCanonical(fid) });
  const { data: legacyIcTable = [] } = q('v2-legacy-ic', async () => (await supabase.from('intellectual_contributions').select('*').eq('faculty_id', fid).order('year', { ascending: false })).data || []);
  const { data: quals = [] } = q('v2-quals', async () => ((await supabase.from('academic_qualifications').select('*').eq('faculty_id', fid).order('year', { ascending: false })).data || []).map((r: any) => ({ ...r, ...repairQualification(r) })));
  const { data: pe = [] } = q('v2-pe', async () => ((await supabase.from('professional_engagements').select('*').eq('faculty_id', fid).order('created_at', { ascending: false })).data || []).map((r: any) => ({ ...r, ...repairEngagement(r) })));
  const { data: svc = [] } = q('v2-svc', async () => ((await supabase.from('service_contributions').select('*').eq('faculty_id', fid).order('created_at', { ascending: false })).data || []).map((r: any) => ({ ...r, ...repairService(r) })));
  const { data: awards = [] } = q('v2-awards', async () => ((await supabase.from('awards_recognition').select('*').eq('faculty_id', fid).order('year', { ascending: false })).data || []).map((r: any) => ({ ...r, award: cleanCvValue(r.award), award_name: cleanCvValue(r.award_name), institution_organization: cleanCvValue(r.institution_organization) })));
  const { data: px = [] } = q('v2-px', async () => ((await supabase.from('professional_experience').select('*').eq('faculty_id', fid).order('created_at', { ascending: false })).data || []).map((r: any) => ({ ...r, position_title: cleanCvValue(r.position_title), organization: cleanCvValue(r.organization), period: cleanCvValue(r.period), key_responsibilities: cleanCvValue(r.key_responsibilities) })));

  const ae = onlyAcademicEngagement(legacyIcTable);
  const legacyIcs = onlyIcs(legacyIcTable);
  const migrated = (canonical?.ics.length || 0) > 0;
  const icCount = migrated ? canonical!.ics.length : legacyIcs.length;

  const latestDegree = profile.highest_degree || [...quals].sort((a: any, b: any) => (b.year || 0) - (a.year || 0))[0]?.degree_certification;
  const common = { facultyId: fid, userId: user!.id };

  const profileFields: [string, any][] = [
    ['Name', `${profile.title ? profile.title + ' ' : ''}${profile.first_name || ''} ${profile.last_name || ''}`.trim()],
    ['LAU ID', profile.employee_id], ['Rank', profile.academic_rank], ['Department', profile.department],
    ['Discipline', profile.discipline], ['FT/PT', profile.ft_pt_status],
    ['Participating / Supporting', profile.faculty_sufficiency], ['AACSB Classification', profile.faculty_qualification],
    ['Latest Degree', latestDegree], ['Email', profile.email], ['Campus', profile.campus], ['Tenure', profile.tenure_status],
  ];
  const counts: [string, number, string][] = [
    ['IC', icCount, 'ic'], ['AE', ae.length, 'ae'], ['PE', pe.length, 'pe'],
    ['Services', svc.length, 'svc'], ['Education / Degrees', quals.length, 'edu'], ['Other Evidence', awards.length, 'other'],
  ];

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="flex flex-wrap h-auto">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="ic">IC</TabsTrigger>
        <TabsTrigger value="ae">AE</TabsTrigger>
        <TabsTrigger value="pe">PE</TabsTrigger>
        <TabsTrigger value="svc">Services</TabsTrigger>
        <TabsTrigger value="edu">Education / Degrees</TabsTrigger>
        <TabsTrigger value="other">Other Evidence</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-muted text-primary"><User className="h-5 w-5" /></div>
              <CardTitle className="font-serif text-base">Faculty Profile</CardTitle>
            </div>
            {onEditProfile && <Button size="sm" variant="outline" onClick={onEditProfile}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>}
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {profileFields.map(([l, v]) => (
              <div key={l}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{l}</p>
                <p className="text-sm">{v || <Badge variant="outline" className="text-xs">Not set</Badge>}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {counts.map(([l, n, t]) => (
            <button key={l} onClick={() => setTab(t)} className="text-left rounded-lg border bg-card p-4 hover:border-primary transition-colors">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="text-2xl font-bold font-serif">{n}</p>
            </button>
          ))}
        </div>
        <CvArchiveCard facultyId={fid} title={archiveTitle} />
      </TabsContent>

      <TabsContent value="ic">
        {migrated ? (
          <IcCanonicalTab facultyId={fid} department={profile.department} />
        ) : (
          <div className="space-y-3">
            <p className="text-xs rounded-md bg-muted p-3 text-muted-foreground">
              This profile has not yet been migrated to the V2 shared-publication model (pilot phase). Records below are the existing entries; points are calculated after migration.
            </p>
            <CvSectionCard
              title="Intellectual Contributions" icon={BookOpen}
              columns={['Title', 'Year', 'Scholarship Portfolio', 'AKSOB Reporting Type', 'Status']}
              rows={legacyIcs}
              renderRow={(ic: any) => [ic.title, ic.year, ic.ic_category, ic.ic_reporting_type || 'Needs Review', verificationLabel(ic)]}
              emptyText="No intellectual contributions recorded." tableName="intellectual_contributions" queryKey="v2-legacy-ic" pkField="ic_id"
              showProof={false} defaultValues={{ record_class: 'ic', verification_status: 'under_review' }}
              formFields={[{ name: 'title', label: 'Title', required: true }, { name: 'authors', label: 'Authors' }, { name: 'year', label: 'Year', type: 'number' }, { name: 'journal_outlet', label: 'Journal / Outlet' }, { name: 'doi', label: 'DOI' }]}
              {...common}
            />
          </div>
        )}
      </TabsContent>

      <TabsContent value="ae">
        <CvSectionCard
          title="Academic Engagement" icon={Users}
          description="Editorial roles, reviewing, conference organisation, supervision, curriculum/accreditation work and faculty development. Never counted in Table 8.1."
          columns={['Activity', 'Year', 'Type / Role', 'Description']}
          rows={ae}
          renderRow={(a: any) => [a.title, a.year, a.activity_type || a.original_cv_item_type, a.journal_outlet || a.apa_citation]}
          emptyText="No academic engagement activities recorded." tableName="intellectual_contributions" queryKey="v2-legacy-ic" pkField="ic_id"
          showProof={false}
          defaultValues={{ record_class: 'academic_engagement', ic_reporting_type: 'Not Applicable', verification_status: 'under_review' }}
          formFields={[{ name: 'title', label: 'Activity', required: true }, { name: 'year', label: 'Year', type: 'number' }, { name: 'activity_type', label: 'Type / Role' }, { name: 'apa_citation', label: 'Description', type: 'textarea' }]}
          {...common}
        />
      </TabsContent>

      <TabsContent value="pe" className="space-y-4">
        <CvSectionCard
          title="Professional Engagement" icon={Briefcase}
          description="Consulting, executive education, boards/advisory roles, associations and industry partnerships. Not counted as ICs."
          columns={['Activity', 'Year', 'Type / Role', 'Description / Organization']}
          rows={pe}
          renderRow={(e: any) => [e.activity, e.year || yearOf(e.from_to) || e.from_to, e.activity_type || e.engagement_type, e.details || e.description]}
          emptyText="No professional engagements recorded." tableName="professional_engagements" queryKey="v2-pe"
          formFields={[{ name: 'activity', label: 'Activity', required: true }, { name: 'from_to', label: 'Year / Period' }, { name: 'engagement_type', label: 'Type / Role' }, { name: 'details', label: 'Description / Organization', type: 'textarea' }]}
          {...common}
        />
        <Collapsible open={pxOpen} onOpenChange={setPxOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span>Professional Experience (employment history — not counted as engagement) · {px.length}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${pxOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <CvSectionCard
              title="Professional Experience" icon={Briefcase}
              columns={['Period', 'Position', 'Organization', 'Key Responsibilities']}
              rows={px}
              renderRow={(x: any) => [x.period, x.position_title, x.organization, x.key_responsibilities]}
              emptyText="No professional experience recorded." tableName="professional_experience" queryKey="v2-px"
              formFields={[{ name: 'period', label: 'Period' }, { name: 'position_title', label: 'Position Title', required: true }, { name: 'organization', label: 'Organization' }, { name: 'key_responsibilities', label: 'Key Responsibilities', type: 'textarea' }]}
              {...common}
            />
          </CollapsibleContent>
        </Collapsible>
      </TabsContent>

      <TabsContent value="svc">
        <CvSectionCard
          title="Services" icon={Heart}
          columns={['Committee / Role', 'Level', 'Year / Period', 'Description']}
          rows={svc}
          renderRow={(s: any) => [s.committee_role, s.level, s.year || s.from_to, s.description]}
          emptyText="No service contributions recorded." tableName="service_contributions" queryKey="v2-svc"
          formFields={[{ name: 'committee_role', label: 'Committee / Role', required: true }, { name: 'level', label: 'Level (University / School / Department / Community)' }, { name: 'from_to', label: 'Year / Period' }, { name: 'description', label: 'Description', type: 'textarea' }]}
          {...common}
        />
      </TabsContent>

      <TabsContent value="edu">
        <CvSectionCard
          title="Education / Degrees" icon={GraduationCap}
          columns={['Degree', 'Field', 'Institution', 'Year']}
          rows={quals}
          renderRow={(q: any) => [q.degree_certification, q.field_area, q.institution, q.year]}
          emptyText="No degrees recorded." tableName="academic_qualifications" queryKey="v2-quals" showProof={false}
          formFields={[{ name: 'degree_certification', label: 'Degree', required: true }, { name: 'field_area', label: 'Field' }, { name: 'institution', label: 'Institution' }, { name: 'year', label: 'Year', type: 'number' }]}
          {...common}
        />
      </TabsContent>

      <TabsContent value="other">
        <CvSectionCard
          title="Other Evidence" icon={Award}
          description="Awards/recognition, grants or projects not treated as ICs, media/outreach. Research awards and grants count as ICs only after review confirms the crosswalk conditions."
          columns={['Type', 'Year', 'Description', 'Organization']}
          rows={awards}
          renderRow={(a: any) => [a.evidence_category || 'Award / Recognition', a.year, a.award || a.award_name, a.institution_organization]}
          emptyText="No other evidence recorded." tableName="awards_recognition" queryKey="v2-awards"
          formFields={[{ name: 'evidence_category', label: 'Type (Award / Grant-Project / Media-Outreach / Other)' }, { name: 'year', label: 'Year', type: 'number' }, { name: 'award', label: 'Description', required: true }, { name: 'institution_organization', label: 'Organization' }]}
          {...common}
        />
      </TabsContent>
    </Tabs>
  );
}
