// Re-export the Supabase client with relaxed typing
// The auto-generated types.ts is empty; we cast to any to allow all table operations
import { supabase as rawSupabase } from '@/integrations/supabase/client';

export const supabase = rawSupabase as any;
