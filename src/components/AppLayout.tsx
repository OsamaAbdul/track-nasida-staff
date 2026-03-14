import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Clock,
  FileWarning,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import nasidaLogo from "@/assets/nasida-logo.png";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles?: string[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Attendance", path: "/attendance", icon: <Clock className="h-5 w-5" /> },
  { label: "Disputes", path: "/disputes", icon: <FileWarning className="h-5 w-5" /> },
  { label: "Staff Management", path: "/admin/staff", icon: <Users className="h-5 w-5" />, roles: ["admin", "hr"] },
  { label: "Attendance Reports", path: "/admin/attendance", icon: <FileText className="h-5 w-5" />, roles: ["admin", "hr"] },
  { label: "Settings", path: "/settings", icon: <Settings className="h-5 w-5" />, roles: ["admin"] },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut, roles } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNav = navItems.filter(
    (item) => !item.roles || item.roles.some((r) => roles.includes(r as any))
  );

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
          <img src={nasidaLogo} alt="NASIDA" className="w-10 h-10 object-contain" />
          <div>
            <h2 className="text-sm font-bold text-sidebar-primary-foreground font-display">NASIDA</h2>
            <p className="text-xs text-sidebar-foreground/60">Attendance System</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-sidebar-foreground/60">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {filteredNav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                location.pathname === item.path
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground text-xs font-bold">
              {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name || "User"}</p>
              <p className="text-xs text-sidebar-foreground/50 capitalize">{roles[0] || "staff"}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-sidebar-accent/50"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b bg-card/80 backdrop-blur-sm px-4 py-3 lg:px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <p className="text-sm text-muted-foreground hidden sm:block">
            Welcome, <span className="font-medium text-foreground">{profile?.full_name || "User"}</span>
          </p>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
