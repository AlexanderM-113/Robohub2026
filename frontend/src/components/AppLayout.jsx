import { useState } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import {
  LayoutDashboard, MessagesSquare, FolderOpen, CalendarDays,
  Settings, Users, LogOut, Menu, X, ListTodo,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import logo from "@/assets/logo.webp";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const roleColors = {
  owner: "bg-secondary text-secondary-foreground",
  mentor: "bg-primary/15 text-primary",
  member: "bg-muted text-muted-foreground",
};

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard", end: true },
  { to: "/chat", label: "Chat", icon: MessagesSquare, testid: "nav-chat" },
  { to: "/files", label: "Files", icon: FolderOpen, testid: "nav-files" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, testid: "nav-calendar" },
  { to: "/todos", label: "To-Do", icon: ListTodo, testid: "nav-todos" },
  { to: "/settings", label: "Settings", icon: Settings, testid: "nav-settings" },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = [...nav];
  if (user?.role === "owner") {
    items.splice(5, 0, { to: "/team", label: "Team", icon: Users, testid: "nav-team" });
  }

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const initials = (user?.name || "U").slice(0, 2).toUpperCase();

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-6 h-20 border-b border-border">
        <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center overflow-hidden">
          <img src={logo} alt="Robotics Hub" className="h-full w-full object-cover" />
        </div>
        <div>
          <p className="font-heading font-bold text-base leading-tight">Robotics Hub</p>
          <p className="text-xs text-muted-foreground">Team Workspace</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-testid={item.testid}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`
            }
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-6">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-muted/60 mb-2">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" data-testid="sidebar-username">{user?.name}</p>
            <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wide ${roleColors[user?.role] || roleColors.member}`}>
              {user?.role}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={handleLogout}
          data-testid="logout-button"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive rounded-xl"
        >
          <LogOut className="h-[18px] w-[18px]" /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-border bg-card flex-col fixed h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative w-64 bg-card border-r border-border">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="h-20 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div>
              <p className="text-sm text-muted-foreground">Welcome back,</p>
              <p className="font-heading font-semibold text-lg leading-tight">{user?.name}</p>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
