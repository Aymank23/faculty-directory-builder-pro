// V2 data access for canonical ICs. Faculty Dashboard, Master Dashboard, Table 8.1 and
// the Excel export all read through these functions — never from legacy IC rows.
import { supabase } from '@/lib/supabase';
import type { CanonicalIc, IcAuthor } from '@/lib/table81';

export async function fetchFacultyCanonical(facultyId: string) {
  const { data: mine } = await supabase.from('ic_authors').select('canonical_ic_id').eq('faculty_id', facultyId);
  const ids = [...new Set((mine || []).map((r: any) => r.canonical_ic_id))];
  if (!ids.length) return { ics: [] as CanonicalIc[], authors: [] as IcAuthor[] };
  const [{ data: ics }, { data: authors }] = await Promise.all([
    supabase.from('canonical_ics').select('*').in('id', ids).order('year', { ascending: false }),
    supabase.from('ic_authors').select('*').in('canonical_ic_id', ids),
  ]);
  return { ics: (ics || []) as CanonicalIc[], authors: (authors || []) as IcAuthor[] };
}

async function fetchAll(table: string, select = '*') {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error || !data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function fetchSchoolCanonical() {
  const [ics, authors, faculty] = await Promise.all([
    fetchAll('canonical_ics'),
    fetchAll('ic_authors'),
    fetchAll('faculty_profiles'),
  ]);
  return { ics: ics as CanonicalIc[], authors: authors as IcAuthor[], faculty };
}

/** Fields that describe the shared publication (edits need a proposal when 2+ AKSOB authors). */
export const SHARED_FIELDS = [
  'title', 'year', 'journal_outlet', 'doi', 'authors', 'total_authors', 'quartile',
  'scholarship_portfolio', 'historical_reporting_type', 'apa_citation',
] as const;
