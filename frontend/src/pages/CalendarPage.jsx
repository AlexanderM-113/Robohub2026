import { useEffect, useState } from "react";
import { CalendarDays, MapPin, Plus, Pencil, Trash2, Loader2, Clock } from "lucide-react";
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

const empty = { title: "", description: "", date: "", location: "" };

function fmt(iso) {
  try {
    const d = new Date(iso);
    return {
      day: d.toLocaleDateString(undefined, { day: "numeric" }),
      month: d.toLocaleDateString(undefined, { month: "short" }),
      full: d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
      time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      past: d < new Date(),
    };
  } catch {
    return { day: "?", month: "", full: iso, time: "", past: false };
  }
}

export default function CalendarPage() {
  const { user } = useAuth();
  const canEdit = ["owner", "mentor"].includes(user?.role);
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/events").then(({ data }) => setEvents(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (ev) => {
    setForm({ title: ev.title, description: ev.description || "", date: ev.date?.slice(0, 16), location: ev.location || "" });
    setEditId(ev.id);
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, date: new Date(form.date).toISOString() };
      if (editId) {
        await api.put(`/events/${editId}`, payload);
        toast.success("Event updated");
      } else {
        await api.post("/events", payload);
        toast.success("Event created — team notified");
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not save event");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/events/${id}`);
      toast.success("Event deleted");
      setEvents((ev) => ev.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-8" data-testid="calendar-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">Team Calendar</h1>
          <p className="text-muted-foreground mt-1">Meetings, competitions, and deadlines for the season.</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="rounded-xl h-11 gap-2" data-testid="add-event-button">
                <Plus className="h-4 w-4" /> Add Event
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-heading">{editId ? "Edit Event" : "New Event"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={save} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Regional Competition" className="rounded-xl" data-testid="event-title-input" />
                </div>
                <div className="space-y-2">
                  <Label>Date & Time</Label>
                  <Input required type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="rounded-xl" data-testid="event-date-input" />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="School gym" className="rounded-xl" data-testid="event-location-input" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Details, what to bring..." className="rounded-xl" data-testid="event-description-input" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving} className="rounded-xl" data-testid="event-save-button">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editId ? "Save Changes" : "Create Event"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {events.length === 0 ? (
        <div className="text-center text-muted-foreground py-24 border border-dashed border-border rounded-2xl">
          <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No events scheduled yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((ev) => {
            const d = fmt(ev.date);
            return (
              <Card key={ev.id} className={`p-5 rounded-2xl flex gap-5 ${d.past ? "opacity-60" : ""}`} data-testid={`event-${ev.id}`}>
                <div className="flex flex-col items-center justify-center h-16 w-16 rounded-xl bg-primary/10 text-primary shrink-0">
                  <span className="font-heading text-2xl font-bold leading-none">{d.day}</span>
                  <span className="text-xs uppercase font-semibold">{d.month}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-lg font-semibold">{ev.title}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{d.time}</span>
                    {ev.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{ev.location}</span>}
                  </div>
                  {ev.description && <p className="mt-2 text-sm">{ev.description}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">Added by {ev.creator_name}</p>
                </div>
                {canEdit && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={() => openEdit(ev)} className="text-muted-foreground hover:text-primary" data-testid={`edit-event-${ev.id}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(ev.id)} className="text-muted-foreground hover:text-destructive" data-testid={`delete-event-${ev.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
