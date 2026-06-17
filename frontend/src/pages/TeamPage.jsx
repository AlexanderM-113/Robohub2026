import { useEffect, useState } from "react";
import { Users, Crown, Loader2 } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function TeamPage() {
  const [users, setUsers] = useState(null);

  const load = () => api.get("/users").then(({ data }) => setUsers(data)).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);

  const changeRole = async (id, role) => {
    try {
      await api.put(`/users/${id}/role`, { role });
      toast.success("Role updated");
      setUsers((u) => u.map((x) => (x.id === id ? { ...x, role } : x)));
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not update role");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-8" data-testid="team-page">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Users className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-bold">Team Members</h1>
          <p className="text-muted-foreground">Manage roles. Only you hold the owner role.</p>
        </div>
      </div>

      {users === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id} className="p-4 rounded-2xl flex items-center gap-4" data-testid={`team-user-${u.id}`}>
              <Avatar className="h-11 w-11">
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                  {(u.name || "U").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate flex items-center gap-2">
                  {u.name}
                  {u.role === "owner" && <Crown className="h-4 w-4 text-secondary" />}
                </p>
                <p className="text-sm text-muted-foreground truncate">{u.email}</p>
              </div>
              {u.role === "owner" ? (
                <Badge className="bg-secondary text-secondary-foreground rounded-lg">Owner</Badge>
              ) : (
                <Select value={u.role} onValueChange={(v) => changeRole(u.id, v)}>
                  <SelectTrigger className="w-32 rounded-xl" data-testid={`role-select-${u.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="mentor">Mentor</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
