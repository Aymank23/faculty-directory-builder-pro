import { supabase } from '@/lib/supabase';

/**
 * Permanent, private archive of original CV documents.
 *
 * Objects live in the private `cv-archive` bucket under `<faculty_id>/<version>-<file name>`.
 * Storage policies allow the faculty member (own profile), the HoD (own department) and
 * admins to read; only admins may overwrite or delete, so an archived original can never
 * be silently replaced.
 */

const BUCKET = 'cv-archive';

export interface CvArchiveResult {
  storage_path: string;
  version: number;
  file_size: number;
  mime_type: string;
  content_hash: string;
}

/** SHA-256 of the file bytes — lets us recognise a re-upload of the identical document. */
export const hashFile = async (file: File): Promise<string> => {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const safeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-120) || 'cv';

/** Next version number for this faculty member's CV archive. */
export const nextCvVersion = async (facultyId: string): Promise<number> => {
  const { data } = await supabase
    .from('cv_uploads')
    .select('version')
    .eq('faculty_id', facultyId)
    .order('version', { ascending: false })
    .limit(1);
  const current = Number(data?.[0]?.version ?? 0);
  return (Number.isFinite(current) ? current : 0) + 1;
};

/**
 * Uploads the original document to the private archive. Never overwrites an existing
 * version — each new document gets its own version number, so history is preserved.
 * Re-uploading a byte-identical document reuses the archived object and version
 * instead of creating a duplicate copy.
 */
export const archiveOriginalCv = async (
  facultyId: string,
  file: File,
): Promise<CvArchiveResult | null> => {
  try {
    const mime = file.type || 'application/octet-stream';
    const content_hash = await hashFile(file);

    // Identical document already archived for this faculty member → reuse it.
    const { data: existing } = await supabase
      .from('cv_uploads')
      .select('storage_path, version, file_size, mime_type, content_hash')
      .eq('faculty_id', facultyId)
      .eq('content_hash', content_hash)
      .not('storage_path', 'is', null)
      .order('version', { ascending: false })
      .limit(1);

    const prior = existing?.[0];
    if (prior?.storage_path) {
      return {
        storage_path: prior.storage_path,
        version: Number(prior.version) || 1,
        file_size: Number(prior.file_size) || file.size,
        mime_type: prior.mime_type || mime,
        content_hash,
      };
    }

    const version = await nextCvVersion(facultyId);
    const path = `${facultyId}/v${version}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: false,
      contentType: mime,
    });
    if (error) {
      console.warn('[cvArchive] upload failed', error);
      return null;
    }
    return { storage_path: path, version, file_size: file.size, mime_type: mime, content_hash };
  } catch (e) {
    console.warn('[cvArchive] unexpected failure', e);
    return null;
  }
};

/** Short-lived signed link so an authorised user can open the stored original. */
export const getArchivedCvUrl = async (storagePath: string): Promise<string | null> => {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) {
    console.warn('[cvArchive] could not sign url', error);
    return null;
  }
  return data.signedUrl;
};
