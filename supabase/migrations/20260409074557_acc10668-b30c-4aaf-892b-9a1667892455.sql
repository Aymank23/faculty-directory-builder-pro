
-- Faculty profiles
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
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.faculty_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to faculty_profiles" ON public.faculty_profiles FOR ALL USING (true) WITH CHECK (true);

-- Intellectual contributions
CREATE TABLE public.intellectual_contributions (
  ic_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_id UUID REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  title TEXT,
  year INTEGER,
  ic_type TEXT,
  ic_category TEXT,
  journal_outlet TEXT,
  quartile TEXT,
  abdc_rank TEXT,
  doi TEXT,
  authors TEXT,
  status TEXT DEFAULT 'under_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.intellectual_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to intellectual_contributions" ON public.intellectual_contributions FOR ALL USING (true) WITH CHECK (true);

-- Teaching load
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

-- Academic qualifications
CREATE TABLE public.academic_qualifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_id UUID REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  qualification_type TEXT,
  description TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.academic_qualifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to academic_qualifications" ON public.academic_qualifications FOR ALL USING (true) WITH CHECK (true);

-- Professional engagements
CREATE TABLE public.professional_engagements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_id UUID REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  engagement_type TEXT,
  description TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.professional_engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to professional_engagements" ON public.professional_engagements FOR ALL USING (true) WITH CHECK (true);

-- Service contributions
CREATE TABLE public.service_contributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_id UUID REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  contribution_type TEXT,
  description TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to service_contributions" ON public.service_contributions FOR ALL USING (true) WITH CHECK (true);

-- Awards & recognition
CREATE TABLE public.awards_recognition (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  faculty_id UUID REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  award_name TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.awards_recognition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to awards_recognition" ON public.awards_recognition FOR ALL USING (true) WITH CHECK (true);
