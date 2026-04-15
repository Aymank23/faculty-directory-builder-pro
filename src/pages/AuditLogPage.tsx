import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';

const AuditLogPage = () => {
  const { data: logs = [] } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200);
      return data || [];
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">Audit Log</h1>
          <p className="text-sm text-muted-foreground">System activity and change tracking</p>
        </div>

        <Card>
          <CardContent className="p-0">
            {logs.length === 0 ? (
              <div className="text-center py-16">
                <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No audit log entries yet. Actions will be recorded as users interact with the system.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{log.action.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{log.target_record || '—'}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{log.details ? JSON.stringify(log.details) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AuditLogPage;
