import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getEvidenceUrl } from '@/lib/evidence';

type ProofStatus = 'missing' | 'uploaded' | 'under_review' | 'verified' | 'rejected' | null;

interface Props {
  tableName: 'professional_engagements' | 'service_contributions' | 'professional_experience';
  rowId: string;
  facultyId: string;
  proofStatus?: ProofStatus;
  proofFilePath?: string | null;
  proofReviewComment?: string | null;
  queryKey: string;
}

const statusVariant = (s: ProofStatus) => {
  if (s === 'verified') return 'default' as const;
  if (s === 'under_review' || s === 'uploaded') return 'secondary' as const;
  if (s === 'rejected') return 'destructive' as const;
  return 'outline' as const;
};

const statusLabel = (s: ProofStatus) => {
  if (!s || s === 'missing') return 'Missing';
  return s.replace('_', ' ');
};

const ProofUploadCell = ({
  tableName,
  rowId,
  facultyId,
  proofStatus,
  proofFilePath,
  proofReviewComment,
  queryKey,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

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
        proof_file_path: path,
        proof_status: 'under_review',
        proof_review_comment: null,
      } as any)
      .eq('id', rowId);

    if (updErr) {
      toast.error(`Save failed: ${updErr.message}`);
      setUploading(false);
      return;
    }

    toast.success('Proof uploaded — awaiting review');
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  };

  const handleView = async () => {
    if (!proofFilePath) return;
    const url = await getEvidenceUrl(proofFilePath);
    window.open(url, '_blank');
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant={statusVariant(proofStatus ?? 'missing')} className="capitalize text-xs">
        {statusLabel(proofStatus ?? 'missing')}
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
