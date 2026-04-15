
-- App Users table (custom auth, not using auth.users)
CREATE TABLE public.app_users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'department_chair', 'advisor')),
  department TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Risk Cases table
CREATE TABLE public.risk_cases (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  department TEXT NOT NULL,
  risk_category TEXT NOT NULL CHECK (risk_category IN ('Category A', 'Category B')),
  assigned_advisor UUID REFERENCES public.app_users(user_id),
  assigned_advisor_name TEXT,
  meeting_status TEXT NOT NULL DEFAULT 'not_started' CHECK (meeting_status IN ('not_started', 'pending', 'completed', 'overdue')),
  aip_status TEXT NOT NULL DEFAULT 'not_started' CHECK (aip_status IN ('not_started', 'pending', 'completed')),
  midterm_review_status TEXT NOT NULL DEFAULT 'not_started' CHECK (midterm_review_status IN ('not_started', 'pending', 'completed')),
  outcome_status TEXT NOT NULL DEFAULT 'not_started' CHECK (outcome_status IN ('not_started', 'pending', 'completed')),
  created_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Intervention Forms table
CREATE TABLE public.intervention_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL UNIQUE REFERENCES public.risk_cases(case_id) ON DELETE CASCADE,
  root_cause_academic TEXT[] DEFAULT '{}',
  root_cause_external TEXT[] DEFAULT '{}',
  root_cause_engagement TEXT[] DEFAULT '{}',
  advisor_notes TEXT,
  course_strategy TEXT[] DEFAULT '{}',
  support_services TEXT[] DEFAULT '{}',
  monitoring_requirements TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Follow Ups table
CREATE TABLE public.follow_ups (
  followup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.risk_cases(case_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  progress_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Outcomes table
CREATE TABLE public.outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL UNIQUE REFERENCES public.risk_cases(case_id) ON DELETE CASCADE,
  final_outcome TEXT NOT NULL CHECK (final_outcome IN ('improved_above_threshold', 'improved_still_at_risk', 'declined_escalated', 'withdrew')),
  cgpa_change NUMERIC(3,2),
  probation_avoided BOOLEAN,
  withdrawal_status BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Audit Log table
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  target_record TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intervention_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Allow all access via anon key (custom auth layer handles authorization)
CREATE POLICY "Allow all access to app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to risk_cases" ON public.risk_cases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to intervention_forms" ON public.intervention_forms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to follow_ups" ON public.follow_ups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to outcomes" ON public.outcomes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to audit_log" ON public.audit_log FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_risk_cases_student ON public.risk_cases(student_id);
CREATE INDEX idx_risk_cases_advisor ON public.risk_cases(assigned_advisor);
CREATE INDEX idx_risk_cases_department ON public.risk_cases(department);
CREATE INDEX idx_follow_ups_case ON public.follow_ups(case_id);
CREATE INDEX idx_audit_log_user ON public.audit_log(user_id);
