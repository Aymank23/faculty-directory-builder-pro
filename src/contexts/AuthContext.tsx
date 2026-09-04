import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export type UserRole = 'admin' | 'hod' | 'faculty';

interface AuthUser {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  department: string | null;
  campus: string | null;
  must_change_password: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Only trust the cached profile when a valid backend session still exists.
    const restore = async () => {
      const stored = localStorage.getItem('aacsb_user');
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session && stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {
          localStorage.removeItem('aacsb_user');
        }
      } else {
        localStorage.removeItem('aacsb_user');
        setUser(null);
      }
      setLoading(false);
    };

    restore();

    const { data: sub } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('aacsb_user');
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = async (username: string, password: string): Promise<{ error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('app-login', {
        body: { username, password },
      });

      if (error || !data?.session || !data?.user) {
        return { error: data?.error || 'Invalid username or password' };
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) return { error: 'Login failed. Please try again.' };

      const authUser: AuthUser = {
        id: data.user.id,
        username: data.user.username,
        full_name: data.user.full_name,
        role: data.user.role as UserRole,
        department: data.user.department,
        campus: data.user.campus ?? null,
        must_change_password: !!data.user.must_change_password,
      };

      setUser(authUser);
      localStorage.setItem('aacsb_user', JSON.stringify(authUser));
      return {};
    } catch {
      return { error: 'Login failed. Please try again.' };
    }
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('aacsb_user');
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
