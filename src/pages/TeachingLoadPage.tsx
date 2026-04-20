import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import { terms, campuses } from '@/lib/constants';
import { toast } from 'sonner';

type TeachingRow = {
  teaching_id?: string;
  course_code?: string;
  course_title?: string;
  section?: string;
  campus?: string;
  credits?: number | string;
  term?: string;
};

const TeachingLoadPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TeachingRow | null>(null);
  const [defaultTerm, setDefaultTerm] = useState<string>(terms[0]);

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('faculty_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: teaching = [] } = useQuery({
    queryKey: ['my-teaching', profile?.faculty_id],
    queryFn: async () => {
      const { data } = await supabase.from('teaching_load').select('*').eq('faculty_id', profile!.faculty_id);
      return data || [];
    },
    enabled: !!profile,
  });

  const getTermData = (term: string) => teaching.filter((t: any) => t.term === term);

  const openAdd = (term: string) => {
    setDefaultTerm(term);
    setEditing({ term, campus: profile?.campus || campuses[0] });
  };
  const openEdit = (row: TeachingRow) => setEditing({ ...row });

  const handleSave = async () => {
    if (!editing || !profile) return;
    if (!editing.course_code?.trim()) { toast.error('Course code is required'); return; }
    if (!editing.term?.trim()) { toast.error('Term is required'); return; }
    const payload: any = {
      faculty_id: profile.faculty_id,
      course_code: editing.course_code.trim(),
      course_title: editing.course_title?.trim() || null,
      section: editing.section?.trim() || null,
      campus: editing.campus || null,
      credits: editing.credits ? Number(editing.credits) : null,
      term: editing.term,
    };
    if (editing.teaching_id) {
      const { error } = await supabase.from('teaching_load').update(payload).eq('teaching_id', editing.teaching_id);
      if (error) { toast.error(`Update failed: ${error.message}`); return; }
      toast.success('Course updated');
    } else {
      const { error } = await supabase.from('teaching_load').insert(payload);
      if (error) { toast.error(`Add failed: ${error.message}`); return; }
      toast.success('Course added');
    }
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ['my-teaching'] });
  };

  const handleDelete = async (row: any) => {
    if (!confirm(`Delete ${row.course_code} ${row.section || ''}?`)) return;
    const { error } = await supabase.from('teaching_load').delete().eq('teaching_id', row.teaching_id);
    if (error) { toast.error(`Delete failed: ${error.message}`); return; }
    toast.success('Course deleted');
    queryClient.invalidateQueries({ queryKey: ['my-teaching'] });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">Teaching Load</h1>
          <p className="text-sm text-muted-foreground">Your course assignments by term</p>
        </div>

        <Tabs defaultValue={terms[0]}>
          <TabsList>
            {terms.map(t => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}
          </TabsList>
          {terms.map(term => {
            const termData = getTermData(term);
            const totalCredits = termData.reduce((sum: number, c: any) => sum + (Number(c.credits) || 0), 0);
            return (
              <TabsContent key={term} value={term}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="font-serif text-base">{term}</CardTitle>
                      <Button size="sm" variant="outline" onClick={() => openAdd(term)} disabled={!profile}>
                        <Plus className="h-4 w-4 mr-1" /> Add Course
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {termData.length === 0 ? (
                      <div className="text-center py-12">
                        <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground">No teaching load data has been added for {term}.</p>
                        <Button size="sm" variant="outline" className="mt-3" onClick={() => openAdd(term)} disabled={!profile}>
                          <Plus className="h-4 w-4 mr-1" /> Add your first course
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Course Code</TableHead>
                              <TableHead>Course Title</TableHead>
                              <TableHead>Section</TableHead>
                              <TableHead>Campus</TableHead>
                              <TableHead className="text-right">Credits</TableHead>
                              <TableHead className="w-24"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {termData.map((c: any) => (
                              <TableRow key={c.teaching_id}>
                                <TableCell className="font-medium">{c.course_code}</TableCell>
                                <TableCell>{c.course_title}</TableCell>
                                <TableCell>{c.section}</TableCell>
                                <TableCell>{c.campus}</TableCell>
                                <TableCell className="text-right">{c.credits}</TableCell>
                                <TableCell className="text-right">
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => handleDelete(c)} className="text-destructive hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <div className="mt-4 flex justify-end gap-6 text-sm">
                          <span className="text-muted-foreground">Total Courses: <strong className="text-foreground">{termData.length}</strong></span>
                          <span className="text-muted-foreground">Total Credits: <strong className="text-foreground">{totalCredits}</strong></span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>

        <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif">
                {editing?.teaching_id ? 'Edit Course' : 'Add Course'}
              </DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Term *</Label>
                    <Select value={editing.term || defaultTerm} onValueChange={v => setEditing({ ...editing, term: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {terms.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Campus</Label>
                    <Select value={editing.campus || ''} onValueChange={v => setEditing({ ...editing, campus: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {campuses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Course Code *</Label>
                    <Input value={editing.course_code || ''} onChange={e => setEditing({ ...editing, course_code: e.target.value })} placeholder="e.g. MGT201" />
                  </div>
                  <div className="space-y-2">
                    <Label>Section</Label>
                    <Input value={editing.section || ''} onChange={e => setEditing({ ...editing, section: e.target.value })} placeholder="e.g. A" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Course Title</Label>
                  <Input value={editing.course_title || ''} onChange={e => setEditing({ ...editing, course_title: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Credits</Label>
                  <Input type="number" step="0.5" value={editing.credits ?? ''} onChange={e => setEditing({ ...editing, credits: e.target.value })} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={handleSave}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default TeachingLoadPage;
