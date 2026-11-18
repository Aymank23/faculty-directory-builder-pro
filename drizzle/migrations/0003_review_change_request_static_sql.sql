CREATE OR REPLACE FUNCTION public.review_change_request(_id uuid, _decision text, _note text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cr public.canonical_ic_change_requests; v text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only an admin can approve or reject shared-publication changes'; END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  SELECT * INTO cr FROM public.canonical_ic_change_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR cr.status <> 'pending' THEN RAISE EXCEPTION 'Request not pending'; END IF;
  IF _decision = 'approved' THEN
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
REVOKE EXECUTE ON FUNCTION public.review_change_request(uuid, text, text) FROM PUBLIC, anon;