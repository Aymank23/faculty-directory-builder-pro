import { ReactNode, useState } from 'react';
import AppSidebar from '@/components/AppSidebar';
import TopBar from '@/components/TopBar';
import { useSidebarState } from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { collapsed } = useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar - hidden on mobile unless toggled */}
      <div className={cn('hidden lg:block')}>
        <AppSidebar />
      </div>
      <div className={cn(
        'lg:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-200',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <AppSidebar />
      </div>

      <div className={cn('flex-1 flex flex-col transition-all duration-200', collapsed ? 'lg:ml-16' : 'lg:ml-60')}>
        <header className="h-14 bg-card border-b border-border flex items-center px-4 lg:px-6 gap-3">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden text-muted-foreground hover:text-foreground">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <TopBar />
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
