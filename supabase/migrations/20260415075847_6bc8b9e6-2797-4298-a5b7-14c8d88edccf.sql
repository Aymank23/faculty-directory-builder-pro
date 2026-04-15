
-- App Users
CREATE TABLE public.app_users (
  user_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'faculty',
  department TEXT,
  campus TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);

-- Audit Log
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  target_table TEXT,
  target_record TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to audit_log" ON public.audit_log FOR ALL USING (true) WITH CHECK (true);

-- Faculty Profiles
CREATE TABLE public.faculty_profiles (
  faculty_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id TEXT,
  first_name TEXT,
  last_name TEXT,
  middle_names TEXT,
  title TEXT,
  department TEXT,
  campus TEXT,
  academic_rank TEXT,
  admin_title TEXT,
  ft_pt_status TEXT DEFAULT 'FT',
  email TEXT,
  faculty_qualification TEXT,
  faculty_sufficiency TEXT,
  tenure_status TEXT,
  highest_degree TEXT,
  highest_degree_date TEXT,
  degree_major TEXT,
  degree_institution TEXT,
  degree_country TEXT,
  date_joining_aksob TEXT,
  discipline_program TEXT,
  user_id UUID REFERENCES public.app_users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.faculty_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to faculty_profiles" ON public.faculty_profiles FOR ALL USING (true) WITH CHECK (true);

-- Intellectual Contributions
CREATE TABLE public.intellectual_contributions (
  ic_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_id UUID REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  title TEXT,
  apa_citation TEXT,
  authors TEXT,
  year INTEGER,
  journal_outlet TEXT,
  ic_category TEXT,
  ic_type TEXT,
  indexing_database TEXT,
  quartile TEXT,
  abdc_rank TEXT,
  doi TEXT,
  impact_factor TEXT,
  status TEXT DEFAULT 'under_review',
  evidence_file_url TEXT,
  evidence_status TEXT DEFAULT 'not_uploaded',
  verification_date TIMESTAMPTZ,
  verified_by UUID REFERENCES public.app_users(user_id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.intellectual_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to intellectual_contributions" ON public.intellectual_contributions FOR ALL USING (true) WITH CHECK (true);

-- Teaching Load
CREATE TABLE public.teaching_load (
  teaching_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_id UUID REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  term TEXT,
  course_code TEXT,
  course_title TEXT,
  section TEXT,
  campus TEXT,
  credits NUMERIC DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teaching_load ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to teaching_load" ON public.teaching_load FOR ALL USING (true) WITH CHECK (true);

-- Academic Qualifications
CREATE TABLE public.academic_qualifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_id UUID REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  qualification_type TEXT,
  degree_certification TEXT,
  institution TEXT,
  description TEXT,
  year INTEGER,
  field_area TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.academic_qualifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to academic_qualifications" ON public.academic_qualifications FOR ALL USING (true) WITH CHECK (true);

-- Professional Engagements
CREATE TABLE public.professional_engagements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_id UUID REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  engagement_type TEXT,
  from_to TEXT,
  activity TEXT,
  description TEXT,
  details TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.professional_engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to professional_engagements" ON public.professional_engagements FOR ALL USING (true) WITH CHECK (true);

-- Service Contributions
CREATE TABLE public.service_contributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_id UUID REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  contribution_type TEXT,
  from_to TEXT,
  level TEXT,
  committee_role TEXT,
  description TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to service_contributions" ON public.service_contributions FOR ALL USING (true) WITH CHECK (true);

-- Awards & Recognition
CREATE TABLE public.awards_recognition (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_id UUID REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  award_name TEXT,
  award TEXT,
  institution_organization TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.awards_recognition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to awards_recognition" ON public.awards_recognition FOR ALL USING (true) WITH CHECK (true);

-- Evidence storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', false) ON CONFLICT DO NOTHING;
CREATE POLICY "Authenticated users can upload evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence');
CREATE POLICY "Authenticated users can read evidence" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'evidence');
CREATE POLICY "Public can read evidence" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'evidence');
CREATE POLICY "Public can upload evidence" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'evidence');

-- Indexes
CREATE INDEX idx_audit_log_user ON public.audit_log(user_id);
CREATE INDEX idx_faculty_profiles_user ON public.faculty_profiles(user_id);
CREATE INDEX idx_ic_faculty ON public.intellectual_contributions(faculty_id);
CREATE INDEX idx_teaching_faculty ON public.teaching_load(faculty_id);
