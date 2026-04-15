
-- Academic & Professional Qualifications (CV Section 2)
CREATE TABLE public.academic_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  degree_certification text NOT NULL,
  institution text,
  year integer,
  field_area text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.academic_qualifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to academic_qualifications" ON public.academic_qualifications FOR ALL TO public USING (true) WITH CHECK (true);

-- Professional Engagement Activities (CV Section 4)
CREATE TABLE public.professional_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  from_to text,
  activity text NOT NULL,
  details text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.professional_engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to professional_engagements" ON public.professional_engagements FOR ALL TO public USING (true) WITH CHECK (true);

-- Service Contributions (CV Section 5)
CREATE TABLE public.service_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  from_to text,
  level text,
  committee_role text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.service_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to service_contributions" ON public.service_contributions FOR ALL TO public USING (true) WITH CHECK (true);

-- Awards & Recognition (CV Section 6)
CREATE TABLE public.awards_recognition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  year integer,
  award text NOT NULL,
  institution_organization text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.awards_recognition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to awards_recognition" ON public.awards_recognition FOR ALL TO public USING (true) WITH CHECK (true);
