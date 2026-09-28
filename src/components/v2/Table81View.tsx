import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, ArrowLeft } from 'lucide-react';
import {
  buildTable81, table81Reconciles, TABLE81_TYPES, deriveTable81Type, normalizePortfolio,
  confirmedAuthors, fmt81, type CanonicalIc, type IcAuthor, type Table81Type,
} from '@/lib/table81';

type Props = { ics: CanonicalIc[]; authors: IcAuthor[]; faculty: any[] };
const PK = { basic: 'Basic / Discovery', applied: 'Applied / Integration', pedagogy: 'Pedagogy / Teaching & Learning' } as const;

export function useTable81({ ics, authors, faculty }: Props) {
  return useMemo(() => {
    const fmap = new Map(faculty.map((f: any) => [f.faculty_id, f]));
    const discOf = (id: string) => fmap.get(id)?.discipline || null;
    return { ...buildTable81(ics, authors, discOf), fmap };
  }, [ics, authors, faculty]);
}

export function exportTable81Xlsx(t: ReturnType<typeof useTable81>, authors: IcAuthor[]) {
  const wb = XLSX.utils.book_new();
  const main = t.rows.map((r) => ({
    Discipline: r.discipline,
    'Basic / Discovery': r.portfolio.basic, 'Applied / Integration': r.portfolio.applied, 'Pedagogy / Teaching & Learning': r.portfolio.pedagogy,
    'Total ICs': r.portfolio.total,
    ...Object.fromEntries(TABLE81_TYPES.map((ty) => [ty, r.byType[ty].total])),
  }));
  main.push({
    Discipline: 'TOTAL', 'Basic / Discovery': t.totals.basic, 'Applied / Integration': t.totals.applied, 'Pedagogy / Teaching & Learning': t.totals.pedagogy, 'Total ICs': t.totals.total,
    ...Object.fromEntries(TABLE81_TYPES.map((ty) => [ty, t.rows.reduce((s, r) => s + r.byType[ty].total, 0)])),
  } as any);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(main), 'Table 8.1');
  const drill: any[] = [];
  t.rows.forEach((r) => TABLE81_TYPES.forEach((ty) => drill.push({ Discipline: r.discipline, 'IC Reporting Type': ty, Basic: r.byType[ty].basic, Applied: r.byType[ty].applied, Pedagogy: r.byType[ty].pedagogy, Total: r.byType[ty].total })));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(drill), 'By Type of IC');
  const disc = new Map<string, string>(); t.rows.forEach((r) => r.icIds.forEach((id) => disc.set(id, [disc.get(id), `${r.discipline} (${r.shares[id].toFixed(2)})`].filter(Boolean).join('; '))));
  const recs = t.counted.map((ic) => {
    const conf = confirmedAuthors(authors, ic.id);
    return {
      'Discipline allocation (D-8)': disc.get(ic.id), Title: ic.title, Year: ic.year, Outlet: ic.journal_outlet, DOI: ic.doi,
      'Scholarship Portfolio': normalizePortfolio(ic.scholarship_portfolio), 'IC Reporting Type': deriveTable81Type(ic.historical_reporting_type),
      'AKSOB Reporting Type (historical)': ic.historical_reporting_type, Quartile: ic.quartile,
      'AKSOB Authors': conf.length,
      'AKSOB Author Names': conf.map((a) => { const f = t.fmap.get(a.faculty_id); return f ? `${f.first_name} ${f.last_name}` : a.faculty_id; }).join('; '),
      'School Points per author': conf.length ? +(1 / conf.length).toFixed(4) : 0,
      'Canonical IC ID': ic.id,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recs), 'Supporting ICs');
  XLSX.writeFile(wb, `AKSOB_Table_8-1_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function Table81View(props: Props) {
  const t = useTable81(props);
  const [disc, setDisc] = useState<string | null>(null);
  const [cell, setCell] = useState<{ type: Table81Type | null; pk: keyof typeof PK | null } | null>(null);
  const ok = table81Reconciles(t.rows, t.counted.length);
  const row = t.rows.find((r) => r.discipline === disc);

  const drillIcs = useMemo(() => {
    if (!row) return [];
    return t.counted.filter((ic) => row.icIds.includes(ic.id)).filter((ic) => {
      if (cell?.type && deriveTable81Type(ic.historical_reporting_type) !== cell.type) return false;
      if (cell?.pk && normalizePortfolio(ic.scholarship_portfolio) !== PK[cell.pk]) return false;
      return true;
    });
  }, [row, cell, t.counted]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={ok ? 'default' : 'destructive'}>{ok ? 'Reconciled' : 'Does not reconcile'}</Badge>
          Generated from Verified, eligible canonical ICs only. Each IC totals 1.00; an IC with authors from several disciplines is split equally between them (D-8).
        </div>
        <Button size="sm" variant="outline" onClick={() => exportTable81Xlsx(t, props.authors)}><Download className="h-4 w-4 mr-1" /> Export Excel</Button>
      </div>

      {!disc ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead rowSpan={2}>Discipline</TableHead>
                  <TableHead colSpan={4} className="text-center border-l">Scholarship Portfolio</TableHead>
                  <TableHead colSpan={3} className="text-center border-l">IC Reporting Type</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="text-right border-l">Basic</TableHead><TableHead className="text-right">Applied</TableHead><TableHead className="text-right">Pedagogy</TableHead><TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right border-l">PRJ Articles</TableHead><TableHead className="text-right">Additional Reviewed</TableHead><TableHead className="text-right">All Other</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No Verified, eligible ICs yet. Records appear here once reviewers verify them in the Verification Queue.</TableCell></TableRow>}
                {t.rows.map((r) => (
                  <TableRow key={r.discipline} className="cursor-pointer" onClick={() => { setDisc(r.discipline); setCell(null); }}>
                    <TableCell className="font-medium text-primary underline-offset-2 hover:underline">{r.discipline}</TableCell>
                    <TableCell className="text-right border-l">{fmt81(r.portfolio.basic)}</TableCell><TableCell className="text-right">{fmt81(r.portfolio.applied)}</TableCell><TableCell className="text-right">{fmt81(r.portfolio.pedagogy)}</TableCell><TableCell className="text-right font-semibold">{fmt81(r.portfolio.total)}</TableCell>
                    {TABLE81_TYPES.map((ty, i) => <TableCell key={ty} className={`text-right ${i === 0 ? 'border-l' : ''}`}>{fmt81(r.byType[ty].total)}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
              {t.rows.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right border-l">{fmt81(t.totals.basic)}</TableCell><TableCell className="text-right">{fmt81(t.totals.applied)}</TableCell><TableCell className="text-right">{fmt81(t.totals.pedagogy)}</TableCell><TableCell className="text-right">{fmt81(t.totals.total)}</TableCell>
                    {TABLE81_TYPES.map((ty, i) => <TableCell key={ty} className={`text-right ${i === 0 ? 'border-l' : ''}`}>{fmt81(t.rows.reduce((s, r) => s + r.byType[ty].total, 0))}</TableCell>)}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Button size="sm" variant="ghost" onClick={() => { setDisc(null); setCell(null); }}><ArrowLeft className="h-4 w-4 mr-1" /> All disciplines</Button>
          <Card>
            <CardHeader><CardTitle className="font-serif text-base">{disc} — by type of IC</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>IC Reporting Type</TableHead><TableHead className="text-right">Basic</TableHead><TableHead className="text-right">Applied</TableHead><TableHead className="text-right">Pedagogy</TableHead><TableHead className="text-right">Total ICs</TableHead></TableRow></TableHeader>
                <TableBody>
                  {TABLE81_TYPES.map((ty) => (
                    <TableRow key={ty}>
                      <TableCell><button className="text-primary hover:underline" onClick={() => setCell({ type: ty, pk: null })}>{ty}</button></TableCell>
                      {(['basic', 'applied', 'pedagogy'] as const).map((pk) => (
                        <TableCell key={pk} className="text-right"><button className="hover:underline" onClick={() => setCell({ type: ty, pk })}>{fmt81(row!.byType[ty][pk])}</button></TableCell>
                      ))}
                      <TableCell className="text-right font-semibold">{fmt81(row!.byType[ty].total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter><TableRow><TableCell>Total ({disc})</TableCell><TableCell className="text-right">{fmt81(row!.portfolio.basic)}</TableCell><TableCell className="text-right">{fmt81(row!.portfolio.applied)}</TableCell><TableCell className="text-right">{fmt81(row!.portfolio.pedagogy)}</TableCell><TableCell className="text-right"><button className="hover:underline" onClick={() => setCell({ type: null, pk: null })}>{fmt81(row!.portfolio.total)}</button></TableCell></TableRow></TableFooter>
              </Table>
            </CardContent>
          </Card>
          {cell && (
            <Card>
              <CardHeader><CardTitle className="font-serif text-base">Individual ICs ({drillIcs.length}){cell.type ? ` · ${cell.type}` : ''}{cell.pk ? ` · ${PK[cell.pk]}` : ''}</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Year</TableHead><TableHead>Scholarship Type</TableHead><TableHead>IC Reporting Type</TableHead><TableHead className="text-right">AKSOB Authors</TableHead><TableHead className="text-right">Discipline Share</TableHead><TableHead className="text-right">School Points / author</TableHead><TableHead>Faculty</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {drillIcs.map((ic) => {
                      const conf = confirmedAuthors(props.authors, ic.id);
                                            return (
                        <TableRow key={ic.id}>
                          <TableCell className="text-sm max-w-md">{ic.title}</TableCell>
                          <TableCell>{ic.year}</TableCell>
                          <TableCell>{normalizePortfolio(ic.scholarship_portfolio)}</TableCell>
                          <TableCell>{deriveTable81Type(ic.historical_reporting_type)}</TableCell>
                          <TableCell className="text-right">{conf.length}</TableCell>
                          <TableCell className="text-right">{row!.shares[ic.id].toFixed(2)}</TableCell><TableCell className="text-right">{(1 / conf.length).toFixed(2)}</TableCell>
                          <TableCell className="text-sm">
                            {conf.map((a) => { const f = t.fmap.get(a.faculty_id); return <Link key={a.faculty_id} to={`/faculty/${a.faculty_id}`} className="block text-primary hover:underline">{f ? `${f.first_name} ${f.last_name}` : '—'}</Link>; })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
