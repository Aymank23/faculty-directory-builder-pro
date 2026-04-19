import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AppSidebar from '@/components/AppSidebar';
import TopBar from '@/components/TopBar';
import { useSidebarState } from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { collapsed } = useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer on route change so it never stays over content.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile drawer is open.
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen flex w-full overflow-x-hidden">
      {/* Desktop sidebar (≥ lg) — fixed, takes its own width */}
      <div className="hidden lg:block">
        <AppSidebar />
      </div>

      {/* Mobile drawer + overlay (< lg) */}
      <div
        className={cn(
          'lg:hidden fixed inset-0 z-40 transition-opacity duration-200',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden={!mobileOpen}
      >
        <div className="absolute inset-0 bg-black/50" />
      </div>
      <div
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-200 will-change-transform',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <AppSidebar />
      </div>

      {/* Main column */}
      <div
        className={cn(
          'flex-1 min-w-0 flex flex-col transition-all duration-200',
          collapsed ? 'lg:ml-16' : 'lg:ml-60'
        )}
      >
        <header className="h-14 bg-card border-b border-border flex items-center px-4 lg:px-6 gap-3 sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden text-muted-foreground hover:text-foreground"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <TopBar />
        </header>
        <main className="flex-1 min-w-0 p-4 lg:p-6 overflow-x-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
