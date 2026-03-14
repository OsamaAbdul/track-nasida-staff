import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import Disputes from "./pages/Disputes";
import AdminStaff from "./pages/AdminStaff";
import AdminAttendance from "./pages/AdminAttendance";
import Onboarding from "./pages/Onboarding";
import PublicHome from "./pages/PublicHome";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/onboarding" element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            } />
            <Route path="/" element={<PublicHome />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AppLayout><Dashboard /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/attendance"
              element={
                <ProtectedRoute>
                  <AppLayout><Attendance /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/disputes"
              element={
                <ProtectedRoute>
                  <AppLayout><Disputes /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/staff"
              element={
                <ProtectedRoute requiredRoles={["admin", "hr"]}>
                  <AppLayout><AdminStaff /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/attendance"
              element={
                <ProtectedRoute requiredRoles={["admin", "hr"]}>
                  <AppLayout><AdminAttendance /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
