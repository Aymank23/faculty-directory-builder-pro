CREATE OR REPLACE FUNCTION public.norm_text(v text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(lower(regexp_replace(coalesce(v,''), '\s+', ' ', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.norm_doi(v text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(v,''))), '^(https?://)?(dx\.)?doi\.org/', ''),
      '[\s\.\,\)\(\]\[;:]+$', ''
    ),
    ''
  );
$$;