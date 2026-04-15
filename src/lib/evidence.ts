import { supabase } from '@/lib/supabase';

/**
 * Get a usable URL for an evidence file.
 * The 'evidence' bucket is private, so we create a signed URL valid for 1 hour.
 * Falls back to the raw path if signing fails.
 */
export const getEvidenceUrl = async (filePathOrUrl: string): Promise<string> => {
  // If it's already a full URL with a token, return as-is
  if (filePathOrUrl.startsWith('http') && filePathOrUrl.includes('token=')) {
    return filePathOrUrl;
  }

  // Extract the storage path from a public URL if needed
  let storagePath = filePathOrUrl;
  if (filePathOrUrl.includes('/storage/v1/object/public/evidence/')) {
    storagePath = filePathOrUrl.split('/storage/v1/object/public/evidence/')[1];
  }

  const { data, error } = await supabase.storage
    .from('evidence')
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (error || !data?.signedUrl) {
    console.warn('Failed to create signed URL:', error);
    return filePathOrUrl;
  }

  return data.signedUrl;
};
