import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, FolderOpen, MessagesSquare, Users, ArrowRight, MapPin, FileCode2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";

const BANNER =
  "https://images.unsplash.com/photo-1596496356933-9b6e0b186b88?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzZ8MHwxfHNlYXJjaHwzfHxyb2JvdGljcyUyMHRlYW0lMjBzdHVkZW50c3xlbnwwfHx8fDE3ODE2OTc2MTJ8MA&ixlib=rb-4.1.0&q=85";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  const cards = [
    { label: "Team Members", value: stats?.member_count, icon: Users, to: "/team", show: user?.role === "owner", color: "text-primary" },
    { label: "Messages", value: stats?.message_count, icon: MessagesSquare, to: "/chat", show: true, color: "text-secondary" },
    { label: "Shared Files", value: stats?.file_count, icon: FolderOpen, to: "/files", show: true, color: "text-primary" },
  ].filter((c) => c.show);

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-8" data-testid="dashboard-page">
      {/* Banner */}
      <div className="relative rounded-2xl overflow-hidden h-44 sm:h-56">
        <img src={BANNER} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-950/90 to-blue-900/40" />
        <div className="relative h-full flex flex-col justify-center px-8 text-white">
          <p className="text-white/70 text-sm mb-1 capitalize">{user?.role} dashboard</p>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold">Hey {user?.name?.split(" ")[0]} 👋</h1>
          <p className="text-white/80 mt-2 max-w-lg">Here's what's happening with your robotics team today.</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} data-testid={`stat-${c.label.toLowerCase().replace(/ /g, "-")}`}>
            <Card className="p-6 rounded-2xl hover:border-primary/50 transition-colors group">
              <div className="flex items-center justify-between">
                <div className={`h-12 w-12 rounded-xl bg-muted flex items-center justify-center ${c.color}`}>
                  <c.icon className="h-6 w-6" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>
              <p className="text-3xl font-heading font-bold mt-4">{c.value ?? "—"}</p>
              <p className="text-muted-foreground text-sm">{c.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Next event */}
        <Card className="lg:col-span-2 p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-lg font-semibold">Next Event</h2>
          </div>
          {stats?.next_event ? (
            <Link to="/calendar" className="block rounded-xl border border-border p-5 hover:border-primary/50 transition-colors" data-testid="dashboard-next-event">
              <p className="font-heading text-xl font-semibold">{stats.next_event.title}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatDate(stats.next_event.date)}</span>
                {stats.next_event.location && (
                  <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{stats.next_event.location}</span>
                )}
              </div>
              {stats.next_event.description && <p className="mt-3 text-sm">{stats.next_event.description}</p>}
            </Link>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No upcoming events scheduled yet.</p>
          )}
        </Card>

        {/* Recent files */}
        <Card className="p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <FileCode2 className="h-5 w-5 text-secondary" />
            <h2 className="font-heading text-lg font-semibold">Recent Files</h2>
          </div>
          {stats?.recent_files?.length ? (
            <ul className="space-y-3">
              {stats.recent_files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 text-sm">
                  <span className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 text-xs font-semibold uppercase text-muted-foreground">
                    {f.kind === "image" ? "IMG" : f.kind === "zip" ? "ZIP" : "<>"}
                  </span>
                  <span className="truncate flex-1">{f.original_filename}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No files shared yet.</p>
          )}
          <Link to="/files" className="mt-4 inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline">
            View all files <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </div>
    </div>
  );
}
