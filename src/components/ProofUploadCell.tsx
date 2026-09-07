import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getEvidenceUrl } from '@/lib/evidence';

export type ProofTable =
  | 'professional_engagements'
  | 'service_contributions'
  | 'professional_experience'
  | 'intellectual_contributions';

/**
 * Column map per table. Intellectual Contributions (including Academic Engagement
 * records, which live in the same table) keep their evidence on evidence_file_url /
 * evidence_status; the CV activity tables use the proof_* columns.
 */
export const PROOF_TABLE_CONFIG: Record<
  ProofTable,
  { pk: string; path: string; status: string; comment: string }
> = {
  professional_engagements: { pk: 'id', path: 'proof_file_path', status: 'proof_status', comment: 'proof_review_comment' },
  service_contributions: { pk: 'id', path: 'proof_file_path', status: 'proof_status', comment: 'proof_review_comment' },
  professional_experience: { pk: 'id', path: 'proof_file_path', status: 'proof_status', comment: 'proof_review_comment' },
  intellectual_contributions: { pk: 'ic_id', path: 'evidence_file_url', status: 'evidence_status', comment: 'rejection_reason' },
};

interface Props {
  tableName: ProofTable;
  row: Record<string, any>;
  facultyId: string;
  queryKey: string;
}

const statusVariant = (s: string) => {
  if (s === 'verified') return 'default' as const;
  if (s === 'under_review' || s === 'uploaded') return 'secondary' as const;
  if (s === 'rejected') return 'destructive' as const;
  return 'outline' as const;
};

const statusLabel = (s: string) => {
  if (!s || s === 'missing' || s === 'not_uploaded') return 'Missing';
  return s.replace(/_/g, ' ');
};

const ProofUploadCell = ({ tableName, row, facultyId, queryKey }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const cfg = PROOF_TABLE_CONFIG[tableName];
  const rowId = String(row?.[cfg.pk] ?? '');
  const proofFilePath: string | null = row?.[cfg.path] ?? null;
  const proofStatus: string = row?.[cfg.status] ?? 'missing';
  const proofReviewComment: string | null = row?.[cfg.comment] ?? null;

  const handleSelect = () => inputRef.current?.click();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error('File too large (max 15 MB)');
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `${facultyId}/${tableName}/${rowId}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('evidence')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) {
      toast.error(`Upload failed: ${upErr.message}`);
      setUploading(false);
      return;
    }

    const { error: updErr } = await supabase
      .from(tableName as any)
      .update({
        [cfg.path]: path,
        [cfg.status]: 'under_review',
        [cfg.comment]: null,
      } as any)
      .eq(cfg.pk, rowId);

    if (updErr) {
      toast.error(`Save failed: ${updErr.message}`);
      setUploading(false);
      return;
    }

    toast.success('Proof uploaded — awaiting review');
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    queryClient.invalidateQueries({ queryKey: [queryKey] });
    queryClient.invalidateQueries();
  };

  const handleView = async () => {
    if (!proofFilePath) return;
    const url = await getEvidenceUrl(proofFilePath);
    window.open(url, '_blank');
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant={statusVariant(proofStatus)} className="capitalize text-xs">
        {statusLabel(proofStatus)}
      </Badge>
      {proofFilePath && (
        <Button variant="ghost" size="sm" onClick={handleView} title="View proof">
          <FileText className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSelect}
        disabled={uploading}
        title={proofFilePath ? 'Replace proof' : 'Upload proof'}
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        className="hidden"
        onChange={handleUpload}
      />
      {proofStatus === 'rejected' && proofReviewComment && (
        <span className="text-xs text-destructive truncate max-w-[160px]" title={proofReviewComment}>
          {proofReviewComment}
        </span>
      )}
    </div>
  );
};

export default ProofUploadCell;
