import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2, Loader2, Clock, User } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const empty = { title: "", description: "", deadline: "", assigned_to: "" };

function deadlineLabel(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = d - now;
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (diff < 0) return { text: "Overdue", color: "text-destructive" };
    if (hours < 1) return { text: "Due soon", color: "text-orange-500" };
    if (hours < 24) return { text: `${hours}h left`, color: "text-orange-500" };
    return { text: `${days}d left`, color: "text-muted-foreground" };
  } catch {
    return null;
  }
}

export default function TodoPage() {
  const { user } = useAuth();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    fetchTodos();
    if (user?.role === "owner") fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  async function fetchTodos() {
    try {
      const res = await api.get("/api/todos");
      setTodos(res.data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e) || "Failed to load todos");
    } finally {
      setLoading(false);
    }
  }

  async function fetchMembers() {
    try {
      const res = await api.get("/api/users");
      setMembers(res.data);
    } catch {}
  }

  async function handleCreate() {
    if (!form.title.trim()) return toast.error("Title is required");
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        deadline: form.deadline || null,
        assigned_to: form.assigned_to || null,
      };
      const res = await api.post("/api/todos", payload);
      setTodos([res.data, ...todos]);
      setForm(empty);
      setOpen(false);
      toast.success("Task created");
    } catch (e) {
      toast.error(formatApiErrorDetail(e) || "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  async function toggleComplete(todo) {
    try {
      const res = await api.put(`/api/todos/${todo.id}`, { completed: !todo.completed });
      setTodos(todos.map((t) => (t.id === todo.id ? res.data : t)));
    } catch (e) {
      toast.error(formatApiErrorDetail(e) || "Failed to update");
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/api/todos/${id}`);
      setTodos(todos.filter((t) => t.id !== id));
      toast.success("Task deleted");
    } catch (e) {
      toast.error(formatApiErrorDetail(e) || "Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pending = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">To-Do</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pending.length} task{pending.length !== 1 ? "s" : ""} remaining
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="What needs to be done?"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Additional details..."
                  rows={3}
                />
              </div>
              <div>
                <Label>Deadline</Label>
                <Input
                  type="datetime-local"
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                />
              </div>
              {user?.role === "owner" && members.length > 0 && (
                <div>
                  <Label>Assign to</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={form.assigned_to}
                    onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                  >
                    <option value="">Unassigned (visible to all)</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pending.length === 0 && completed.length === 0 && (
        <Card className="p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium">No tasks yet</p>
          <p className="text-sm mt-1">Create your first task to get started.</p>
        </Card>
      )}

      {pending.length > 0 && (
        <div className="space-y-2 mb-8">
          {pending.map((todo) => {
            const dl = deadlineLabel(todo.deadline);
            return (
              <Card key={todo.id} className="flex items-start gap-3 p-4">
                <button onClick={() => toggleComplete(todo)} className="mt-0.5 shrink-0">
                  <Circle className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{todo.title}</p>
                  {todo.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{todo.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {dl && (
                      <span className={`flex items-center gap-1 text-xs ${dl.color}`}>
                        <Clock className="h-3 w-3" /> {dl.text}
                      </span>
                    )}
                    {todo.creator_name && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" /> {todo.creator_name}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(todo.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">
            Completed ({completed.length})
          </h2>
          <div className="space-y-2 opacity-60">
            {completed.map((todo) => (
              <Card key={todo.id} className="flex items-start gap-3 p-4">
                <button onClick={() => toggleComplete(todo)} className="mt-0.5 shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-through">{todo.title}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(todo.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
