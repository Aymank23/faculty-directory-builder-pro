CREATE OR REPLACE FUNCTION public.ic_author_directory(_ic_id uuid)
RETURNS TABLE(link_id uuid, faculty_id uuid, full_name text, department text, discipline text, link_status text, review_note text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.can_view_canonical_ic(_ic_id) THEN RAISE EXCEPTION 'NOT_PERMITTED'; END IF;
  RETURN QUERY SELECT a.id, a.faculty_id, btrim(coalesce(f.first_name,'')||' '||coalesce(f.last_name,'')),
    coalesce(a.department_snapshot, f.department), f.discipline, a.link_status, a.review_note
  FROM public.ic_authors a JOIN public.faculty_profiles f ON f.faculty_id = a.faculty_id
  WHERE a.canonical_ic_id = _ic_id ORDER BY a.link_status, f.last_name;
END $$;
REVOKE EXECUTE ON FUNCTION public.ic_author_directory(uuid) FROM anon;