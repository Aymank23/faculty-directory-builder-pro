// Single write path for faculty-entered intellectual contributions (V2 canonical model).
// Every creation goes through the `submit_canonical_contribution` database function, which
// re-checks duplicates, forces Under Review, creates a *proposed* author link (admins: confirmed)
// and writes the audit log. The UI never inserts canonical_ics / ic_authors directly.
import { supabase } from '@/lib/supabase';
import type { IcAuthor } from '@/lib/table81';
import { confirmedAuthors } from '@/lib/table81';
import { SHARED_FIELDS } from '@/lib/canonicalData';

export interface CanonicalMatch {
  id: string; title: string | null; year: number | null; journal_outlet: string | null;
  doi: string | null; authors: string | null; match_method: 'doi' | 'title_year';
}

export async function findCanonicalMatches(doi: string | null, title: string | null, year: number | null) {
  const { data, error } = await supabase.rpc('find_canonical_matches' as any, { _doi: doi || null, _title: title || null, _year: year ?? null });
  if (error) throw error;
  return (data || []) as CanonicalMatch[];
}

export async function submitCanonicalContribution(opts: {
  facultyId: string; payload: Record<string, any>; linkTo?: string | null; confirmNotDuplicate?: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_canonical_contribution' as any, {
    _faculty_id: opts.facultyId, _payload: opts.payload, _link_to: opts.linkTo ?? null,
    _confirm_not_duplicate: !!opts.confirmNotDuplicate,
  });
  if (error) throw error;
  return data as string;
}

export async function uploadCanonicalEvidence(facultyId: string, icId: string, file: File) {
  const ext = file.name.split('.').pop();
  const path = `${facultyId}/canonical-${icId}.${ext}`;
  const { error } = await supabase.storage.from('evidence').upload(path, file, { cacheControl: '3600', upsert: true });
  if (error) throw error;
  const { error: e2 } = await supabase.rpc('attach_canonical_evidence' as any, { _id: icId, _path: path });
  if (e2) throw e2;
  return path;
}

/** Faculty may withdraw their own *proposed* author link (confirmed links need an admin). */
export async function withdrawProposedLink(linkId: string) {
  const { error } = await supabase.from('ic_authors').delete().eq('id', linkId).eq('link_status', 'proposed');
  if (error) throw error;
}

/** Edit: single-author (or admin) edits apply directly; shared publications become change proposals. */
export async function saveCanonicalEdit(opts: {
  ic: any; payload: Record<string, any>; authors: IcAuthor[]; isAdmin: boolean; userId: string; reason?: string;
}): Promise<'none' | 'applied' | 'proposed'> {
  const { ic, payload, authors, isAdmin, userId, reason } = opts;
  const changed = SHARED_FIELDS.filter((k) => String(ic[k] ?? '') !== String(payload[k] ?? ''));
  if (!changed.length) return 'none';
  const shared = confirmedAuthors(authors, ic.id).length > 1;
  if (shared && !isAdmin) {
    const rows = changed.map((k) => ({
      canonical_ic_id: ic.id, proposed_by: userId, field: k,
      old_value: ic[k] == null ? null : String(ic[k]), new_value: payload[k] == null ? null : String(payload[k]),
      reason: reason || null,
    }));
    const { error } = await supabase.from('canonical_ic_change_requests').insert(rows);
    if (error) throw error;
    return 'proposed';
  }
  const upd = Object.fromEntries(changed.map((k) => [k, payload[k]]));
  const { error } = await supabase.from('canonical_ics').update(upd).eq('id', ic.id);
  if (error) throw error;
  return 'applied';
}

export function friendlyWriteError(e: any): string {
  const m = String(e?.message || e || '');
  if (m.includes('DUPLICATE_DOI')) return 'A publication with this DOI already exists. Link yourself to it instead of creating a duplicate.';
  if (m.includes('POSSIBLE_DUPLICATE')) return 'A publication with the same title and year already exists.';
  if (m.includes('SHARED_IC_PROPOSAL_REQUIRED')) return 'This publication is shared with other AKSOB authors — an admin must approve this change.';
  if (m.includes('NOT_PERMITTED')) return 'You are not allowed to do this.';
  return m || 'Save failed';
}
