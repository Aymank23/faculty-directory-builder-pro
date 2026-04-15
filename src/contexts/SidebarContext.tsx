import { createContext, useContext, useState, ReactNode } from 'react';

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType>({ collapsed: false, setCollapsed: () => {}, toggle: () => {} });

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setCollapsed(c => !c);
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebarState = () => useContext(SidebarContext);
