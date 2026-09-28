ALTER TABLE public.ic_authors DROP CONSTRAINT ic_authors_link_status_check;
ALTER TABLE public.ic_authors ADD CONSTRAINT ic_authors_link_status_check CHECK (link_status IN ('proposed','confirmed','rejected'));
ALTER TABLE public.ic_authors ADD COLUMN IF NOT EXISTS review_note text;

ALTER TABLE public.canonical_ic_change_requests
  ADD COLUMN IF NOT EXISTS hod_recommendation text CHECK (hod_recommendation IN ('approve','reject')),
  ADD COLUMN IF NOT EXISTS hod_note text,
  ADD COLUMN IF NOT EXISTS hod_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS hod_reviewed_at timestamptz;

-- HoD scope: every confirmed AKSOB author of the IC belongs to the HoD's department (and at least one exists)
CREATE OR REPLACE FUNCTION public.hod_can_review_ic(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_hod()
    AND EXISTS (SELECT 1 FROM public.ic_authors a WHERE a.canonical_ic_id = _id AND a.link_status = 'confirmed')
    AND NOT EXISTS (
      SELECT 1 FROM public.ic_authors a JOIN public.faculty_profiles f ON f.faculty_id = a.faculty_id
      WHERE a.canonical_ic_id = _id AND a.link_status = 'confirmed'
        AND f.department IS DISTINCT FROM public.current_department());
$$;
REVOKE ALL ON FUNCTION public.hod_can_review_ic(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hod_can_review_ic(uuid) TO authenticated;

-- ic_authors: faculty may only suggest; admin alone confirms / rejects
DROP POLICY IF EXISTS ic_authors_insert ON public.ic_authors;
CREATE POLICY ic_authors_insert ON public.ic_authors FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (link_status = 'proposed' AND confirmed_by IS NULL AND public.can_edit_faculty(faculty_id)));
DROP POLICY IF EXISTS ic_authors_update ON public.ic_authors;
CREATE POLICY ic_authors_update ON public.ic_authors FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- canonical_ics insert: own records only (admin any); non-admin inserts forced to Under Review
DROP POLICY IF EXISTS canonical_ics_insert ON public.canonical_ics;
CREATE POLICY canonical_ics_insert ON public.canonical_ics FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR created_by = public.current_app_user_id());

CREATE OR REPLACE FUNCTION public.tg_canonical_ic_insert_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    NEW.verification_status := 'under_review'; NEW.verified_by := NULL; NEW.verification_date := NULL;
    IF NEW.eligibility = 'include' THEN NEW.eligibility := 'conditional'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_canonical_ic_insert_guard() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_canonical_ic_insert_guard ON public.canonical_ics;
CREATE TRIGGER trg_canonical_ic_insert_guard BEFORE INSERT ON public.canonical_ics FOR EACH ROW EXECUTE FUNCTION public.tg_canonical_ic_insert_guard();

-- canonical_ics update guard: verification/eligibility only admin or in-scope HoD
CREATE OR REPLACE FUNCTION public.tg_canonical_ic_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  shared_changed boolean;
  diff jsonb := '{}'::jsonb;
  k text;
  o jsonb := to_jsonb(OLD);
  n jsonb := to_jsonb(NEW);
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL OR public.is_admin() THEN
    NULL;
  ELSE
    IF (NEW.verification_status, NEW.verified_by, NEW.verification_date, NEW.eligibility, NEW.condition_note, NEW.rejection_reason, NEW.admin_notes)
       IS DISTINCT FROM (OLD.verification_status, OLD.verified_by, OLD.verification_date, OLD.eligibility, OLD.condition_note, OLD.rejection_reason, OLD.admin_notes)
       AND NOT public.hod_can_review_ic(NEW.id) THEN
      RAISE EXCEPTION 'REVIEW_NOT_PERMITTED: only an admin, or the HoD of every confirmed author, can change verification or eligibility';
    END IF;
    shared_changed := (NEW.title, NEW.apa_citation, NEW.year, NEW.journal_outlet, NEW.doi, NEW.authors, NEW.total_authors,
                       NEW.quartile, NEW.abdc_rank, NEW.scholarship_portfolio, NEW.historical_reporting_type, NEW.evidence_file_url, NEW.canonical_key, NEW.created_by)
      IS DISTINCT FROM (OLD.title, OLD.apa_citation, OLD.year, OLD.journal_outlet, OLD.doi, OLD.authors, OLD.total_authors,
                       OLD.quartile, OLD.abdc_rank, OLD.scholarship_portfolio, OLD.historical_reporting_type, OLD.evidence_file_url, OLD.canonical_key, OLD.created_by);
    IF shared_changed AND public.confirmed_author_count(NEW.id) > 1 THEN
      RAISE EXCEPTION 'SHARED_IC_PROPOSAL_REQUIRED: this publication is linked to several AKSOB authors; submit a change proposal';
    END IF;
    IF shared_changed AND OLD.verification_status = 'verified' THEN
      NEW.verification_status := 'under_review'; NEW.verified_by := NULL; NEW.verification_date := NULL;
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
END $function$;

-- change requests: admin final; in-scope HoD may only record a recommendation
DROP POLICY IF EXISTS cicr_update ON public.canonical_ic_change_requests;
CREATE POLICY cicr_update ON public.canonical_ic_change_requests FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.hod_can_review_ic(canonical_ic_id))
  WITH CHECK (public.is_admin() OR public.hod_can_review_ic(canonical_ic_id));

CREATE OR REPLACE FUNCTION public.tg_cicr_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF (NEW.status, NEW.reviewed_by, NEW.reviewed_at, NEW.review_note, NEW.field, NEW.new_value, NEW.old_value, NEW.proposed_by, NEW.canonical_ic_id)
       IS DISTINCT FROM (OLD.status, OLD.reviewed_by, OLD.reviewed_at, OLD.review_note, OLD.field, OLD.new_value, OLD.old_value, OLD.proposed_by, OLD.canonical_ic_id) THEN
      RAISE EXCEPTION 'Only an admin can approve or reject a shared-publication change';
    END IF;
    NEW.hod_reviewed_by := public.current_app_user_id(); NEW.hod_reviewed_at := now();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_cicr_guard() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_cicr_guard ON public.canonical_ic_change_requests;
CREATE TRIGGER trg_cicr_guard BEFORE UPDATE ON public.canonical_ic_change_requests FOR EACH ROW EXECUTE FUNCTION public.tg_cicr_guard();

-- Admin RPC: confirm / reject a proposed co-author link
CREATE OR REPLACE FUNCTION public.review_author_link(_link_id uuid, _decision text, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.ic_authors;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only an admin can confirm or reject co-author links'; END IF;
  IF _decision NOT IN ('confirmed','rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  SELECT * INTO r FROM public.ic_authors WHERE id = _link_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link not found'; END IF;
  UPDATE public.ic_authors SET link_status = _decision, confirmed_by = auth.uid(), confirmed_at = now(), review_note = _note
   WHERE id = _link_id;
  -- author set changed: a verified IC returns to review so points are re-checked
  UPDATE public.canonical_ics SET verification_status = 'under_review', verified_by = NULL, verification_date = NULL
   WHERE id = r.canonical_ic_id AND verification_status = 'verified' AND _decision = 'confirmed' AND r.link_status <> 'confirmed';
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (public.current_app_user_id(), 'author_link_' || _decision, 'ic_authors', _link_id::text,
          jsonb_build_object('canonical_ic_id', r.canonical_ic_id, 'faculty_id', r.faculty_id, 'before', r.link_status, 'note', _note));
END $$;

-- Admin RPC: approve / reject a shared change request (approval applies the change atomically)
CREATE OR REPLACE FUNCTION public.review_change_request(_id uuid, _decision text, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cr public.canonical_ic_change_requests;
  allowed text[] := ARRAY['title','apa_citation','year','journal_outlet','doi','authors','total_authors','quartile','abdc_rank','impact_factor','indexing_database','scholarship_portfolio','historical_reporting_type','evidence_file_url'];
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only an admin can approve or reject shared-publication changes'; END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  SELECT * INTO cr FROM public.canonical_ic_change_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR cr.status <> 'pending' THEN RAISE EXCEPTION 'Request not pending'; END IF;
  IF _decision = 'approved' THEN
    IF NOT (cr.field = ANY(allowed)) THEN RAISE EXCEPTION 'Field % cannot be changed by proposal', cr.field; END IF;
    EXECUTE format('UPDATE public.canonical_ics SET %I = $1::%s, verification_status = CASE WHEN verification_status = ''verified'' THEN ''under_review'' ELSE verification_status END WHERE id = $2',
                   cr.field, CASE WHEN cr.field IN ('year','total_authors') THEN 'integer' ELSE 'text' END)
      USING NULLIF(cr.new_value, ''), cr.canonical_ic_id;
  END IF;
  UPDATE public.canonical_ic_change_requests SET status = _decision, reviewed_by = public.current_app_user_id(), reviewed_at = now(), review_note = _note WHERE id = _id;
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (public.current_app_user_id(), 'change_request_' || _decision, 'canonical_ic_change_requests', _id::text,
          jsonb_build_object('canonical_ic_id', cr.canonical_ic_id, 'field', cr.field, 'old', cr.old_value, 'new', cr.new_value, 'note', _note));
END $$;

-- Reviewer RPC: Verify / Under Review / Exclude (admin, or HoD in scope)
CREATE OR REPLACE FUNCTION public.set_canonical_verification(_id uuid, _status text, _eligibility text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old public.canonical_ics;
BEGIN
  IF NOT (public.is_admin() OR public.hod_can_review_ic(_id)) THEN RAISE EXCEPTION 'REVIEW_NOT_PERMITTED'; END IF;
  IF _status NOT IN ('verified','under_review','excluded') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  SELECT * INTO old FROM public.canonical_ics WHERE id = _id FOR UPDATE;
  IF _status = 'verified' THEN
    IF public.confirmed_author_count(_id) = 0 THEN RAISE EXCEPTION 'Cannot verify: no confirmed AKSOB author'; END IF;
    IF coalesce(_eligibility, old.eligibility) = 'conditional' THEN RAISE EXCEPTION 'Cannot verify: resolve the conditional classification first (Include or Exclude)'; END IF;
  END IF;
  UPDATE public.canonical_ics SET
    verification_status = _status,
    eligibility = coalesce(_eligibility, eligibility),
    verified_by = CASE WHEN _status = 'verified' THEN public.current_app_user_id() END,
    verification_date = CASE WHEN _status = 'verified' THEN now() END,
    rejection_reason = CASE WHEN _status = 'excluded' THEN _note ELSE rejection_reason END,
    admin_notes = CASE WHEN _note IS NOT NULL AND _status <> 'excluded' THEN _note ELSE admin_notes END
  WHERE id = _id;
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (public.current_app_user_id(), 'canonical_ic_' || _status, 'canonical_ics', _id::text,
          jsonb_build_object('before', old.verification_status, 'eligibility_before', old.eligibility, 'eligibility_after', coalesce(_eligibility, old.eligibility), 'note', _note));
END $$;

REVOKE ALL ON FUNCTION public.review_author_link(uuid,text,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.review_change_request(uuid,text,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.set_canonical_verification(uuid,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_author_link(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_change_request(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_canonical_verification(uuid,text,text,text) TO authenticated;

-- audit log readable by the reviewers of the record (admin sees all already)
DROP POLICY IF EXISTS audit_log_select_canonical ON public.audit_log;
CREATE POLICY audit_log_select_canonical ON public.audit_log FOR SELECT TO authenticated
  USING (target_table = 'canonical_ics' AND public.can_view_canonical_ic(target_record::uuid));