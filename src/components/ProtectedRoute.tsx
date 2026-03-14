import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, loading, roles } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Handle onboarding redirect
  const { profile } = useAuth();
  if (profile && !profile.onboarded && window.location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  if (requiredRoles && requiredRoles.length > 0) {
    const hasRequired = requiredRoles.some((role) => roles.includes(role));
    if (!hasRequired) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
