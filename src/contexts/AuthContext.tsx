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
    const stored = localStorage.getItem('aacsb_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('aacsb_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<{ error?: string }> => {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', username)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        return { error: 'Invalid username or password' };
      }

      if (data.password_hash !== password) {
        return { error: 'Invalid username or password' };
      }

      const authUser: AuthUser = {
        id: data.user_id,
        username: data.username,
        full_name: data.full_name,
        role: data.role as UserRole,
        department: data.department,
        campus: data.campus ?? null,
        must_change_password: data.must_change_password,
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
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
