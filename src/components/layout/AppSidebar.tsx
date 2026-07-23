import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, FilePlus, Settings, LogOut, PanelLeftClose, PanelLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: typeof Home;
  to: string;
  /** Highlight active when the current path starts with this. */
  match: (path: string) => boolean;
}

/**
 * Teal-style left navigation for the signed-in app shell: wordmark on top, primary
 * nav with a teal active state, sign-out at the bottom, and a collapse toggle.
 */
export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { language } = useLanguage();
  const isSv = language === "sv";
  const [collapsed, setCollapsed] = useState(false);

  const path = location.pathname;
  const items: NavItem[] = [
    { label: isSv ? "Hem" : "Home", icon: Home, to: "/dashboard", match: (p) => p === "/dashboard" || p.startsWith("/editor") },
    { label: isSv ? "Nytt CV" : "New CV", icon: FilePlus, to: "/wizard/create", match: (p) => p.startsWith("/wizard") },
    { label: isSv ? "Inställningar" : "Settings", icon: Settings, to: "/settings", match: (p) => p.startsWith("/settings") },
  ];

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar-background transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Wordmark + collapse */}
      <div className="flex h-16 items-center justify-between px-3">
        {!collapsed && (
          <button onClick={() => navigate("/dashboard")} className="px-2 text-lg font-semibold tracking-tight text-primary">
            CVSäkert
          </button>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title={collapsed ? (isSv ? "Expandera" : "Expand") : (isSv ? "Fäll ihop" : "Collapse")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {items.map((item) => {
          const active = item.match(path);
          const Icon = item.icon;
          return (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active && "text-primary")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="p-2">
        <button
          onClick={signOut}
          title={collapsed ? (isSv ? "Logga ut" : "Sign out") : undefined}
          className={cn(
            "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60",
            collapsed && "justify-center px-0",
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>{isSv ? "Logga ut" : "Sign out"}</span>}
        </button>
      </div>
    </aside>
  );
}
