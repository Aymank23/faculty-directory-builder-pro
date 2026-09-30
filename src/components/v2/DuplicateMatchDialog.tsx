import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CanonicalMatch } from '@/lib/canonicalWrite';

export default function DuplicateMatchDialog({ matches, open, busy, onLink, onCreateNew, onCancel }: {
  matches: CanonicalMatch[]; open: boolean; busy?: boolean;
  onLink: (id: string) => void; onCreateNew: () => void; onCancel: () => void;
}) {
  const doiMatch = matches.some((m) => m.match_method === 'doi');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="font-serif">This publication may already exist</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          To avoid double counting, link yourself to the existing record if it is the same publication. An admin will confirm you as an author.
        </p>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {matches.map((m) => (
            <div key={m.id} className="rounded-md border border-border p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm">
                <div className="font-medium">{m.title || '—'}</div>
                <div className="text-xs text-muted-foreground">{[m.journal_outlet, m.year, m.doi].filter(Boolean).join(' · ')}</div>
                {m.authors && <div className="text-xs text-muted-foreground truncate">{m.authors}</div>}
                <Badge variant="outline" className="text-[10px] mt-1">{m.match_method === 'doi' ? 'Same DOI' : 'Same title and year'}</Badge>
              </div>
              <Button size="sm" disabled={busy} onClick={() => onLink(m.id)}>This is mine — link me</Button>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          {!doiMatch && <Button variant="secondary" onClick={onCreateNew} disabled={busy}>Different publication — create new</Button>}
        </DialogFooter>
        {doiMatch && <p className="text-[11px] text-muted-foreground">A record with the same DOI must be linked rather than duplicated.</p>}
      </DialogContent>
    </Dialog>
  );
}
