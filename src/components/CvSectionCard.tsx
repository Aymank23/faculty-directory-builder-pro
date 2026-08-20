import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import ProofUploadCell from '@/components/ProofUploadCell';

const PROOF_TABLES = new Set(['professional_engagements', 'service_contributions', 'professional_experience']);

export interface CvFormField {
  name: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number' | 'textarea';
}

export interface CvSectionCardProps {
  title: string;
  icon: any;
  columns: string[];
  rows: any[];
  renderRow: (row: any) => (string | number | null | undefined)[];
  emptyText: string;
  tableName: string;
  facultyId: string;
  userId: string;
  /** react-query key prefix to invalidate after mutations */
  queryKey: string;
  formFields: CvFormField[];
  /** primary key column of the table (defaults to `id`) */
  pkField?: string;
  /** hide the proof column even for proof-capable tables */
  showProof?: boolean;
}

const CvSectionCard = ({
  title,
  icon: Icon,
  columns,
  rows,
  renderRow,
  emptyText,
  tableName,
  facultyId,
  userId,
  queryKey,
  formFields,
  pkField = 'id',
  showProof = true,
}: CvSectionCardProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const withProof = showProof && PROOF_TABLES.has(tableName);

  const openAdd = () => {
    setEditingRow(null);
    setForm({});
    setDialogOpen(true);
  };

  const openEdit = (row: any) => {
    setEditingRow(row);
    const next: Record<string, string> = {};
    formFields.forEach(f => {
      const v = row[f.name];
      next[f.name] = v == null ? '' : String(v);
    });
    setForm(next);
    setDialogOpen(true);
  };

  const buildPayload = () => {
    const payload: any = {};
    formFields.forEach(f => {
      const val = form[f.name]?.trim() || null;
      payload[f.name] = f.type === 'number' && val ? Number.parseInt(val, 10) : val;
    });
    return payload;
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [queryKey] });
    // Related dashboards / analytics read from the same tables — refresh everything.
    queryClient.invalidateQueries();
  };

  const handleSave = async () => {
    for (const rf of formFields.filter(f => f.required)) {
      if (!form[rf.name]?.trim()) {
        toast.error(`${rf.label} is required`);
        return;
      }
    }
    setSaving(true);
    const payload = buildPayload();

    if (editingRow) {
      const { error } = await supabase
        .from(tableName as any)
        .update(payload)
        .eq(pkField, editingRow[pkField]);
      if (error) {
        toast.error(`Update failed: ${error.message}`);
        setSaving(false);
        return;
      }
      await supabase.from('audit_log').insert({
        user_id: userId,
        action: `edit_${tableName}`,
        target_table: tableName,
        target_record: String(editingRow[pkField]),
        details: payload,
      });
      toast.success('Entry updated');
    } else {
      const { error } = await supabase.from(tableName as any).insert({ faculty_id: facultyId, ...payload } as any);
      if (error) {
        toast.error(`Failed to add entry: ${error.message}`);
        setSaving(false);
        return;
      }
      await supabase.from('audit_log').insert({
        user_id: userId,
        action: `add_${tableName}`,
        target_table: tableName,
        details: payload,
      });
      toast.success('Entry added');
    }

    setSaving(false);
    setDialogOpen(false);
    setEditingRow(null);
    setForm({});
    refresh();
  };

  const handleDelete = async (row: any) => {
    if (!confirm('Delete this entry?')) return;
    const { error } = await supabase.from(tableName as any).delete().eq(pkField, row[pkField]);
    if (error) {
      toast.error('Delete failed');
      return;
    }
    await supabase.from('audit_log').insert({
      user_id: userId,
      action: `delete_${tableName}`,
      target_table: tableName,
      target_record: String(row[pkField]),
    });
    toast.success('Entry deleted');
    refresh();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted text-primary"><Icon className="h-5 w-5" /></div>
            <CardTitle className="font-serif text-base">{title} ({rows.length})</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map(c => <TableHead key={c}>{c}</TableHead>)}
                  {withProof && <TableHead>Proof</TableHead>}
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={row[pkField] || i}>
                    {renderRow(row).map((cell, j) => (
                      <TableCell key={j} className="text-sm">{cell || '—'}</TableCell>
                    ))}
                    {withProof && (
                      <TableCell>
                        <ProofUploadCell
                          tableName={tableName as any}
                          rowId={row.id}
                          facultyId={facultyId}
                          proofStatus={row.proof_status}
                          proofFilePath={row.proof_file_path}
                          proofReviewComment={row.proof_review_comment}
                          queryKey={queryKey}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)} aria-label="Edit entry">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(row)}
                        aria-label="Delete entry"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) setEditingRow(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">{editingRow ? 'Edit Entry' : 'Add Entry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {formFields.map(f => (
              <div key={f.name} className="space-y-2">
                <Label>{f.label}{f.required ? ' *' : ''}</Label>
                {f.type === 'textarea' ? (
                  <Textarea
                    rows={3}
                    value={form[f.name] || ''}
                    onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                  />
                ) : (
                  <Input
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={form[f.name] || ''}
                    onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingRow ? 'Save Changes' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CvSectionCard;
