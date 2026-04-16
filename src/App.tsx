import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import LoginPage from "./pages/LoginPage";
import MasterDashboardPage from "./pages/MasterDashboardPage";
import FacultyOverviewPage from "./pages/FacultyOverviewPage";
import FacultyProfilePage from "./pages/FacultyProfilePage";
import UploadCvPage from "./pages/UploadCvPage";
import TeachingLoadPage from "./pages/TeachingLoadPage";
import AddContributionPage from "./pages/AddContributionPage";
import MyRepositoryPage from "./pages/MyRepositoryPage";
import MyAnalyticsPage from "./pages/MyAnalyticsPage";
import DepartmentOverviewPage from "./pages/DepartmentOverviewPage";
import VerificationQueuePage from "./pages/VerificationQueuePage";
import DepartmentReportsPage from "./pages/DepartmentReportsPage";
import FacultyDirectoryPage from "./pages/FacultyDirectoryPage";
import ImportCenterPage from "./pages/ImportCenterPage";
import AACSBExportsPage from "./pages/AACSBExportsPage";
import UserManagementPage from "./pages/UserManagementPage";
import AuditLogPage from "./pages/AuditLogPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'faculty') return <Navigate to="/overview" replace />;
    if (user.role === 'hod') return <Navigate to="/department-overview" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

const AuthRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    if (user.role === 'faculty') return <Navigate to="/overview" replace />;
    if (user.role === 'hod') return <Navigate to="/department-overview" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SidebarProvider>
          <Routes>
            <Route path="/" element={<AuthRedirect />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Faculty routes */}
            <Route path="/overview" element={<ProtectedRoute allowedRoles={['faculty']}><FacultyOverviewPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute allowedRoles={['faculty']}><FacultyProfilePage /></ProtectedRoute>} />
            <Route path="/upload-cv" element={<ProtectedRoute allowedRoles={['faculty']}><UploadCvPage /></ProtectedRoute>} />
            <Route path="/teaching-load" element={<ProtectedRoute allowedRoles={['faculty']}><TeachingLoadPage /></ProtectedRoute>} />
            <Route path="/add-contribution" element={<ProtectedRoute allowedRoles={['faculty']}><AddContributionPage /></ProtectedRoute>} />
            <Route path="/my-repository" element={<ProtectedRoute allowedRoles={['faculty']}><MyRepositoryPage /></ProtectedRoute>} />
            <Route path="/my-analytics" element={<ProtectedRoute allowedRoles={['faculty']}><MyAnalyticsPage /></ProtectedRoute>} />

            {/* HOD routes */}
            <Route path="/department-overview" element={<ProtectedRoute allowedRoles={['hod']}><DepartmentOverviewPage /></ProtectedRoute>} />
            <Route path="/department-reports" element={<ProtectedRoute allowedRoles={['hod']}><DepartmentReportsPage /></ProtectedRoute>} />

            {/* Shared HOD + Admin */}
            <Route path="/verification-queue" element={<ProtectedRoute allowedRoles={['hod', 'admin']}><VerificationQueuePage /></ProtectedRoute>} />

            {/* Admin routes */}
            <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin']}><MasterDashboardPage /></ProtectedRoute>} />
            <Route path="/faculty-directory" element={<ProtectedRoute allowedRoles={['admin']}><FacultyDirectoryPage /></ProtectedRoute>} />
            <Route path="/import-center" element={<ProtectedRoute allowedRoles={['admin']}><ImportCenterPage /></ProtectedRoute>} />
            <Route path="/aacsb-exports" element={<ProtectedRoute allowedRoles={['admin']}><AACSBExportsPage /></ProtectedRoute>} />
            <Route path="/user-management" element={<ProtectedRoute allowedRoles={['admin']}><UserManagementPage /></ProtectedRoute>} />
            <Route path="/audit-log" element={<ProtectedRoute allowedRoles={['admin']}><AuditLogPage /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </SidebarProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
