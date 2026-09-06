import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getArchivedCvUrl } from '@/lib/cvArchive';
import { Archive, Download, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  facultyId: string;
  title?: string;
}

/** Version history of the original CV documents kept in the private archive. */
const CvArchiveCard = ({ facultyId, title = 'Original CV Archive' }: Props) => {
  const { data: uploads = [], isLoading } = useQuery({
    queryKey: ['cv-archive', facultyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cv_uploads')
        .select('id, file_name, upload_timestamp, storage_path, version, file_size, mime_type')
        .eq('faculty_id', facultyId)
        .order('upload_timestamp', { ascending: false });
      return data || [];
    },
    enabled: !!facultyId,
  });

  const open = async (path: string) => {
    const url = await getArchivedCvUrl(path);
    if (!url) {
      toast.error('This file could not be opened. You may not have access to it.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Archive className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        <Badge variant="outline" className="gap-1 text-[10px]">
          <Lock className="h-3 w-3" /> Private
        </Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : uploads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No CV uploads recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>File name</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Original</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploads.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell>v{u.version ?? 1}</TableCell>
                  <TableCell className="max-w-[22rem] truncate">{u.file_name}</TableCell>
                  <TableCell>{u.upload_timestamp ? new Date(u.upload_timestamp).toLocaleString() : '—'}</TableCell>
                  <TableCell>{u.file_size ? `${Math.round(u.file_size / 1024)} KB` : '—'}</TableCell>
                  <TableCell className="text-right">
                    {u.storage_path ? (
                      <Button size="sm" variant="outline" onClick={() => open(u.storage_path)}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Open
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not archived</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default CvArchiveCard;
