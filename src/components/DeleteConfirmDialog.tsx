import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  loading?: boolean;
}

const DeleteConfirmDialog = ({ open, onOpenChange, onConfirm, title = 'Delete Entry', description = 'Are you sure you want to delete this entry? This action cannot be undone.', loading }: DeleteConfirmDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="font-serif flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          {title}
        </DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{description}</p>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
        <Button variant="destructive" onClick={onConfirm} disabled={loading}>
          {loading ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default DeleteConfirmDialog;
