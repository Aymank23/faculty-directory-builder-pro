import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { terms } from '@/lib/constants';

const TeachingLoadPage = () => {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('faculty_profiles').select('*').eq('user_id', user!.id).single();
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

  const getTermData = (term: string) => teaching.filter(t => t.term === term);

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
            const totalCredits = termData.reduce((sum, c) => sum + (Number(c.credits) || 0), 0);
            return (
              <TabsContent key={term} value={term}>
                <Card>
                  <CardHeader>
                    <CardTitle className="font-serif text-base">{term}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {termData.length === 0 ? (
                      <div className="text-center py-12">
                        <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground">No teaching load data has been imported for {term}.</p>
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
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {termData.map(c => (
                              <TableRow key={c.teaching_id}>
                                <TableCell className="font-medium">{c.course_code}</TableCell>
                                <TableCell>{c.course_title}</TableCell>
                                <TableCell>{c.section}</TableCell>
                                <TableCell>{c.campus}</TableCell>
                                <TableCell className="text-right">{c.credits}</TableCell>
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
      </div>
    </AppLayout>
  );
};

export default TeachingLoadPage;
