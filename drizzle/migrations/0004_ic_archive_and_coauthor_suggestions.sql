ALTER TABLE public.canonical_ics ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS archived_by uuid, ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE OR REPLACE FUNCTION public.tg_canonical_ic_archive_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.archived_at, NEW.archived_by, NEW.archive_reason) IS DISTINCT FROM (OLD.archived_at, OLD.archived_by, OLD.archive_reason)
     AND auth.uid() IS NOT NULL AND NOT public.is_admin()
     AND coalesce(current_setting('app.archive_rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION 'NOT_PERMITTED: use the Remove action';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_canonical_ic_archive_guard ON public.canonical_ics;
CREATE TRIGGER trg_canonical_ic_archive_guard BEFORE UPDATE ON public.canonical_ics FOR EACH ROW EXECUTE FUNCTION public.tg_canonical_ic_archive_guard();

-- Faculty/admin removal entry point
CREATE OR REPLACE FUNCTION public.request_ic_removal(_id uuid, _faculty_id uuid, _reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := public.current_app_user_id(); c public.canonical_ics; lnk public.ic_authors; others int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO c FROM public.canonical_ics WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_ARCHIVED'; END IF;
  IF public.is_admin() THEN
    PERFORM set_config('app.archive_rpc','on',true);
    UPDATE public.canonical_ics SET archived_at = now(), archived_by = me, archive_reason = _reason WHERE id = _id;
    INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
    VALUES (me, 'canonical_ic_archived', 'canonical_ics', _id::text, jsonb_build_object('reason', _reason, 'by', 'admin'));
    RETURN 'archived';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.faculty_profiles f WHERE f.faculty_id = _faculty_id AND f.user_id = me) THEN
    RAISE EXCEPTION 'NOT_PERMITTED: you can only remove your own publications';
  END IF;
  SELECT * INTO lnk FROM public.ic_authors WHERE canonical_ic_id = _id AND faculty_id = _faculty_id AND link_status <> 'rejected';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_LINKED'; END IF;
  SELECT count(*) INTO others FROM public.ic_authors WHERE canonical_ic_id = _id AND faculty_id <> _faculty_id AND link_status <> 'rejected';
  IF others = 0 AND c.verification_status <> 'verified' THEN
    PERFORM set_config('app.archive_rpc','on',true);
    UPDATE public.canonical_ics SET archived_at = now(), archived_by = me, archive_reason = _reason WHERE id = _id;
    INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
    VALUES (me, 'canonical_ic_archived', 'canonical_ics', _id::text, jsonb_build_object('reason', _reason, 'by', 'faculty_single_author'));
    RETURN 'archived';
  END IF;
  IF others = 0 AND lnk.link_status = 'proposed' AND c.verification_status <> 'verified' THEN
    RETURN 'archived';
  END IF;
  IF EXISTS (SELECT 1 FROM public.canonical_ic_change_requests WHERE canonical_ic_id = _id AND status = 'pending' AND field IN ('__archive','__remove_author') AND proposed_by = me) THEN
    RETURN 'already_requested';
  END IF;
  INSERT INTO public.canonical_ic_change_requests(canonical_ic_id, proposed_by, field, old_value, new_value, reason)
  VALUES (_id, me, CASE WHEN others = 0 THEN '__archive' ELSE '__remove_author' END, NULL, _faculty_id::text,
          coalesce(_reason, CASE WHEN others = 0 THEN 'Remove verified publication' ELSE 'Remove my authorship' END));
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (me, 'canonical_ic_removal_requested', 'canonical_ics', _id::text, jsonb_build_object('faculty_id', _faculty_id, 'shared', others > 0, 'reason', _reason));
  RETURN 'requested';
END $$;

CREATE OR REPLACE FUNCTION public.admin_restore_canonical_ic(_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only an admin can restore'; END IF;
  UPDATE public.canonical_ics SET archived_at = NULL, archived_by = NULL, archive_reason = NULL WHERE id = _id AND archived_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not archived'; END IF;
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (public.current_app_user_id(), 'canonical_ic_restored', 'canonical_ics', _id::text, jsonb_build_object('note', _note));
END $$;

CREATE OR REPLACE FUNCTION public.search_aksob_faculty(_q text)
RETURNS TABLE(faculty_id uuid, first_name text, last_name text, department text, discipline text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.current_app_user_id() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF length(btrim(coalesce(_q,''))) < 2 THEN RETURN; END IF;
  RETURN QUERY SELECT f.faculty_id, f.first_name, f.last_name, f.department, f.discipline FROM public.faculty_profiles f
   WHERE (coalesce(f.first_name,'') || ' ' || coalesce(f.last_name,'')) ILIKE '%' || btrim(_q) || '%'
   ORDER BY f.last_name LIMIT 15;
END $$;

CREATE OR REPLACE FUNCTION public.suggest_canonical_coauthor(_ic_id uuid, _faculty_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := public.current_app_user_id(); dept text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.can_view_canonical_ic(_ic_id) THEN RAISE EXCEPTION 'NOT_PERMITTED'; END IF;
  IF EXISTS (SELECT 1 FROM public.canonical_ics WHERE id = _ic_id AND archived_at IS NOT NULL) THEN RAISE EXCEPTION 'Publication is archived'; END IF;
  IF EXISTS (SELECT 1 FROM public.ic_authors WHERE canonical_ic_id = _ic_id AND faculty_id = _faculty_id AND link_status <> 'rejected') THEN
    RAISE EXCEPTION 'ALREADY_LINKED: this person is already listed';
  END IF;
  SELECT department INTO dept FROM public.faculty_profiles WHERE faculty_id = _faculty_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Faculty not found'; END IF;
  DELETE FROM public.ic_authors WHERE canonical_ic_id = _ic_id AND faculty_id = _faculty_id AND link_status = 'rejected';
  INSERT INTO public.ic_authors(canonical_ic_id, faculty_id, department_snapshot, link_status, review_note)
  VALUES (_ic_id, _faculty_id, dept, 'proposed', coalesce(_note, 'Suggested co-author'));
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (me, 'coauthor_suggested', 'canonical_ics', _ic_id::text, jsonb_build_object('faculty_id', _faculty_id, 'note', _note));
END $$;

-- Change-request review now also handles removal requests
CREATE OR REPLACE FUNCTION public.review_change_request(_id uuid, _decision text, _note text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE cr public.canonical_ic_change_requests; v text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only an admin can approve or reject shared-publication changes'; END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  SELECT * INTO cr FROM public.canonical_ic_change_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR cr.status <> 'pending' THEN RAISE EXCEPTION 'Request not pending'; END IF;
  IF _decision = 'approved' AND cr.field = '__archive' THEN
    UPDATE public.canonical_ics SET archived_at = now(), archived_by = public.current_app_user_id(), archive_reason = cr.reason WHERE id = cr.canonical_ic_id;
  ELSIF _decision = 'approved' AND cr.field = '__remove_author' THEN
    UPDATE public.ic_authors SET link_status = 'rejected', confirmed_by = auth.uid(), confirmed_at = now(), review_note = 'Authorship removed on request: ' || coalesce(cr.reason,'')
     WHERE canonical_ic_id = cr.canonical_ic_id AND faculty_id::text = cr.new_value;
    UPDATE public.canonical_ics SET verification_status = 'under_review', verified_by = NULL, verification_date = NULL
     WHERE id = cr.canonical_ic_id AND verification_status = 'verified';
  ELSIF _decision = 'approved' THEN
    v := NULLIF(cr.new_value, '');
    UPDATE public.canonical_ics c SET
      title = CASE WHEN cr.field='title' THEN v ELSE c.title END,
      apa_citation = CASE WHEN cr.field='apa_citation' THEN v ELSE c.apa_citation END,
      year = CASE WHEN cr.field='year' THEN v::integer ELSE c.year END,
      journal_outlet = CASE WHEN cr.field='journal_outlet' THEN v ELSE c.journal_outlet END,
      doi = CASE WHEN cr.field='doi' THEN v ELSE c.doi END,
      authors = CASE WHEN cr.field='authors' THEN v ELSE c.authors END,
      total_authors = CASE WHEN cr.field='total_authors' THEN v::integer ELSE c.total_authors END,
      quartile = CASE WHEN cr.field='quartile' THEN v ELSE c.quartile END,
      abdc_rank = CASE WHEN cr.field='abdc_rank' THEN v ELSE c.abdc_rank END,
      impact_factor = CASE WHEN cr.field='impact_factor' THEN v ELSE c.impact_factor END,
      indexing_database = CASE WHEN cr.field='indexing_database' THEN v ELSE c.indexing_database END,
      scholarship_portfolio = CASE WHEN cr.field='scholarship_portfolio' THEN v ELSE c.scholarship_portfolio END,
      historical_reporting_type = CASE WHEN cr.field='historical_reporting_type' THEN coalesce(v, c.historical_reporting_type) ELSE c.historical_reporting_type END,
      evidence_file_url = CASE WHEN cr.field='evidence_file_url' THEN v ELSE c.evidence_file_url END,
      verification_status = CASE WHEN c.verification_status = 'verified' THEN 'under_review' ELSE c.verification_status END
    WHERE c.id = cr.canonical_ic_id
      AND cr.field IN ('title','apa_citation','year','journal_outlet','doi','authors','total_authors','quartile','abdc_rank','impact_factor','indexing_database','scholarship_portfolio','historical_reporting_type','evidence_file_url');
    IF NOT FOUND THEN RAISE EXCEPTION 'Field % cannot be changed by proposal', cr.field; END IF;
  END IF;
  UPDATE public.canonical_ic_change_requests SET status = _decision, reviewed_by = public.current_app_user_id(), reviewed_at = now(), review_note = _note WHERE id = _id;
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (public.current_app_user_id(), 'change_request_' || _decision, 'canonical_ic_change_requests', _id::text,
          jsonb_build_object('canonical_ic_id', cr.canonical_ic_id, 'field', cr.field, 'old', cr.old_value, 'new', cr.new_value, 'note', _note));
END $function$;

REVOKE EXECUTE ON FUNCTION public.request_ic_removal(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_restore_canonical_ic(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_aksob_faculty(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.suggest_canonical_coauthor(uuid, uuid, text) FROM anon;