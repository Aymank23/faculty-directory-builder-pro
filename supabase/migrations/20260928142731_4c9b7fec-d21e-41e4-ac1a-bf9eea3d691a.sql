
-- ===== canonical_ics =====
CREATE TABLE public.canonical_ics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  apa_citation text,
  year integer,
  journal_outlet text,
  doi text,
  authors text,
  total_authors integer,
  quartile text,
  abdc_rank text,
  impact_factor text,
  indexing_database text,
  scholarship_portfolio text,
  historical_reporting_type text NOT NULL DEFAULT 'Needs Review',
  original_cv_item_type text,
  activity_type text,
  verification_status text NOT NULL DEFAULT 'under_review' CHECK (verification_status IN ('verified','under_review','excluded')),
  eligibility text NOT NULL DEFAULT 'conditional' CHECK (eligibility IN ('include','exclude','conditional')),
  condition_note text,
  evidence_file_url text,
  evidence_status text DEFAULT 'not_uploaded',
  verified_by uuid,
  verification_date timestamptz,
  rejection_reason text,
  admin_notes text,
  canonical_key text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX canonical_ics_key_idx ON public.canonical_ics(canonical_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canonical_ics TO authenticated;
GRANT ALL ON public.canonical_ics TO service_role;
ALTER TABLE public.canonical_ics ENABLE ROW LEVEL SECURITY;

-- ===== ic_authors =====
CREATE TABLE public.ic_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_ic_id uuid NOT NULL REFERENCES public.canonical_ics(id) ON DELETE CASCADE,
  faculty_id uuid NOT NULL REFERENCES public.faculty_profiles(faculty_id) ON DELETE CASCADE,
  department_snapshot text,
  author_position integer,
  link_status text NOT NULL DEFAULT 'proposed' CHECK (link_status IN ('proposed','confirmed')),
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_ic_id, faculty_id)
);
CREATE INDEX ic_authors_faculty_idx ON public.ic_authors(faculty_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ic_authors TO authenticated;
GRANT ALL ON public.ic_authors TO service_role;
ALTER TABLE public.ic_authors ENABLE ROW LEVEL SECURITY;

-- ===== legacy_ic_link =====
CREATE TABLE public.legacy_ic_link (
  legacy_ic_id uuid PRIMARY KEY REFERENCES public.intellectual_contributions(ic_id) ON DELETE CASCADE,
  canonical_ic_id uuid NOT NULL REFERENCES public.canonical_ics(id) ON DELETE CASCADE,
  match_method text NOT NULL CHECK (match_method IN ('doi','title_year','title','single','manual')),
  conflict_fields jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX legacy_ic_link_canon_idx ON public.legacy_ic_link(canonical_ic_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legacy_ic_link TO authenticated;
GRANT ALL ON public.legacy_ic_link TO service_role;
ALTER TABLE public.legacy_ic_link ENABLE ROW LEVEL SECURITY;

-- ===== activity_outputs =====
CREATE TABLE public.activity_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_table text NOT NULL CHECK (activity_table IN ('professional_engagements','service_contributions','awards_recognition','intellectual_contributions','professional_experience')),
  activity_id uuid NOT NULL,
  canonical_ic_id uuid NOT NULL REFERENCES public.canonical_ics(id) ON DELETE CASCADE,
  relationship text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_table, activity_id, canonical_ic_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_outputs TO authenticated;
GRANT ALL ON public.activity_outputs TO service_role;
ALTER TABLE public.activity_outputs ENABLE ROW LEVEL SECURITY;

-- ===== canonical_ic_change_requests =====
CREATE TABLE public.canonical_ic_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_ic_id uuid NOT NULL REFERENCES public.canonical_ics(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cicr_ic_idx ON public.canonical_ic_change_requests(canonical_ic_id, status);
GRANT SELECT, INSERT, UPDATE ON public.canonical_ic_change_requests TO authenticated;
GRANT ALL ON public.canonical_ic_change_requests TO service_role;
ALTER TABLE public.canonical_ic_change_requests ENABLE ROW LEVEL SECURITY;

-- ===== classification_policies =====
CREATE TABLE public.classification_policies (
  activity_type text PRIMARY KEY,
  destination text NOT NULL CHECK (destination IN ('IC','AE','PE','Services','Education','Other Evidence')),
  table81 text NOT NULL CHECK (table81 IN ('include','exclude','conditional')),
  historical_reporting_type text,
  condition_note text,
  requires_review boolean NOT NULL DEFAULT false,
  provisional boolean NOT NULL DEFAULT false,
  decision_ref text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.classification_policies TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.classification_policies TO authenticated;
GRANT ALL ON public.classification_policies TO service_role;
ALTER TABLE public.classification_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY classification_policies_select ON public.classification_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY classification_policies_admin ON public.classification_policies FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===== additive columns =====
ALTER TABLE public.professional_engagements ADD COLUMN IF NOT EXISTS activity_type text;
ALTER TABLE public.service_contributions ADD COLUMN IF NOT EXISTS activity_type text;
ALTER TABLE public.awards_recognition ADD COLUMN IF NOT EXISTS activity_type text;
ALTER TABLE public.awards_recognition ADD COLUMN IF NOT EXISTS evidence_category text;
ALTER TABLE public.intellectual_contributions ADD COLUMN IF NOT EXISTS activity_type text;

-- ===== helper functions =====
CREATE OR REPLACE FUNCTION public.can_view_canonical_ic(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
    OR EXISTS (SELECT 1 FROM public.ic_authors a WHERE a.canonical_ic_id = _id AND public.can_view_faculty(a.faculty_id))
    OR EXISTS (SELECT 1 FROM public.canonical_ics c WHERE c.id = _id AND c.created_by = public.current_app_user_id());
$$;

CREATE OR REPLACE FUNCTION public.confirmed_author_count(_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.ic_authors WHERE canonical_ic_id = _id AND link_status = 'confirmed';
$$;

-- ===== policies =====
CREATE POLICY canonical_ics_select ON public.canonical_ics FOR SELECT TO authenticated USING (public.can_view_canonical_ic(id));
CREATE POLICY canonical_ics_insert ON public.canonical_ics FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_hod() OR created_by = public.current_app_user_id());
CREATE POLICY canonical_ics_update ON public.canonical_ics FOR UPDATE TO authenticated
  USING (public.can_view_canonical_ic(id)) WITH CHECK (public.can_view_canonical_ic(id));
CREATE POLICY canonical_ics_delete ON public.canonical_ics FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY ic_authors_select ON public.ic_authors FOR SELECT TO authenticated USING (public.can_view_canonical_ic(canonical_ic_id));
CREATE POLICY ic_authors_insert ON public.ic_authors FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (public.can_edit_faculty(faculty_id) AND link_status = 'proposed')
    OR (public.can_edit_faculty(faculty_id) AND public.confirmed_author_count(canonical_ic_id) = 0));
CREATE POLICY ic_authors_update ON public.ic_authors FOR UPDATE TO authenticated
  USING (public.is_admin() OR (public.is_hod() AND public.can_view_faculty(faculty_id)))
  WITH CHECK (public.is_admin() OR (public.is_hod() AND public.can_view_faculty(faculty_id)));
CREATE POLICY ic_authors_delete ON public.ic_authors FOR DELETE TO authenticated
  USING (public.is_admin() OR (link_status = 'proposed' AND public.can_edit_faculty(faculty_id)));

CREATE POLICY legacy_ic_link_select ON public.legacy_ic_link FOR SELECT TO authenticated USING (public.can_view_canonical_ic(canonical_ic_id));
CREATE POLICY legacy_ic_link_admin ON public.legacy_ic_link FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY activity_outputs_select ON public.activity_outputs FOR SELECT TO authenticated USING (public.can_view_canonical_ic(canonical_ic_id));
CREATE POLICY activity_outputs_insert ON public.activity_outputs FOR INSERT TO authenticated WITH CHECK (public.can_view_canonical_ic(canonical_ic_id));
CREATE POLICY activity_outputs_delete ON public.activity_outputs FOR DELETE TO authenticated USING (public.is_admin() OR created_by = public.current_app_user_id());

CREATE POLICY cicr_select ON public.canonical_ic_change_requests FOR SELECT TO authenticated
  USING (public.is_admin() OR proposed_by = public.current_app_user_id() OR public.can_view_canonical_ic(canonical_ic_id));
CREATE POLICY cicr_insert ON public.canonical_ic_change_requests FOR INSERT TO authenticated
  WITH CHECK (proposed_by = public.current_app_user_id() AND status = 'pending' AND public.can_view_canonical_ic(canonical_ic_id));
CREATE POLICY cicr_update ON public.canonical_ic_change_requests FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===== shared-IC safeguard + audit trigger =====
CREATE OR REPLACE FUNCTION public.tg_canonical_ic_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  shared_changed boolean;
  diff jsonb := '{}'::jsonb;
  k text;
  o jsonb := to_jsonb(OLD);
  n jsonb := to_jsonb(NEW);
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL OR public.is_admin() THEN
    NULL; -- admins / service maintenance
  ELSE
    IF (NEW.verification_status, NEW.verified_by, NEW.verification_date, NEW.eligibility)
       IS DISTINCT FROM (OLD.verification_status, OLD.verified_by, OLD.verification_date, OLD.eligibility)
       AND NOT public.is_hod() THEN
      RAISE EXCEPTION 'Only reviewers can change verification or eligibility';
    END IF;
    shared_changed := (NEW.title, NEW.apa_citation, NEW.year, NEW.journal_outlet, NEW.doi, NEW.authors, NEW.total_authors,
                       NEW.quartile, NEW.abdc_rank, NEW.scholarship_portfolio, NEW.historical_reporting_type, NEW.evidence_file_url)
      IS DISTINCT FROM (OLD.title, OLD.apa_citation, OLD.year, OLD.journal_outlet, OLD.doi, OLD.authors, OLD.total_authors,
                       OLD.quartile, OLD.abdc_rank, OLD.scholarship_portfolio, OLD.historical_reporting_type, OLD.evidence_file_url);
    IF shared_changed AND public.confirmed_author_count(NEW.id) > 1 THEN
      RAISE EXCEPTION 'SHARED_IC_PROPOSAL_REQUIRED: this publication is linked to several AKSOB authors; submit a change proposal';
    END IF;
    IF shared_changed AND OLD.verification_status = 'verified' THEN
      NEW.verification_status := 'under_review';
      NEW.verified_by := NULL;
      NEW.verification_date := NULL;
    END IF;
  END IF;
  FOR k IN SELECT jsonb_object_keys(n) LOOP
    IF k NOT IN ('updated_at') AND (o -> k) IS DISTINCT FROM (n -> k) THEN
      diff := diff || jsonb_build_object(k, jsonb_build_object('before', o -> k, 'after', n -> k));
    END IF;
  END LOOP;
  IF diff <> '{}'::jsonb THEN
    INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
    VALUES (public.current_app_user_id(), 'canonical_ic_updated', 'canonical_ics', NEW.id::text, diff);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_canonical_ic_guard BEFORE UPDATE ON public.canonical_ics
  FOR EACH ROW EXECUTE FUNCTION public.tg_canonical_ic_guard();

CREATE OR REPLACE FUNCTION public.tg_audit_generic()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (public.current_app_user_id(), lower(TG_OP) || '_' || TG_TABLE_NAME, TG_TABLE_NAME,
          COALESCE((to_jsonb(NEW)->>'id'), (to_jsonb(OLD)->>'id')),
          jsonb_build_object('before', CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
                             'after',  CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END));
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_audit_ic_authors AFTER INSERT OR UPDATE OR DELETE ON public.ic_authors FOR EACH ROW EXECUTE FUNCTION public.tg_audit_generic();
CREATE TRIGGER trg_audit_cicr AFTER INSERT OR UPDATE ON public.canonical_ic_change_requests FOR EACH ROW EXECUTE FUNCTION public.tg_audit_generic();
CREATE TRIGGER trg_audit_activity_outputs AFTER INSERT OR DELETE ON public.activity_outputs FOR EACH ROW EXECUTE FUNCTION public.tg_audit_generic();
CREATE TRIGGER trg_audit_policies AFTER INSERT OR UPDATE OR DELETE ON public.classification_policies FOR EACH ROW EXECUTE FUNCTION public.tg_audit_generic();
