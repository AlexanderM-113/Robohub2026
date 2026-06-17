import { useState } from "react";
import { Bell, Mail, MessageSquare, Loader2, User } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    email_notifications: user?.email_notifications ?? true,
    sms_notifications: user?.sms_notifications ?? false,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/auth/me/settings", form);
      updateUser(data);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-8 space-y-8" data-testid="settings-page">
      <div>
        <h1 className="font-heading text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your profile and notification preferences.</p>
      </div>

      <Card className="p-6 lg:p-8 rounded-2xl space-y-6">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">Profile</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-xl h-11" data-testid="settings-name-input" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email} disabled className="rounded-xl h-11 opacity-70" />
          </div>
          <div className="space-y-2">
            <Label>Phone (for SMS, e.g. +14155550123)</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1..." className="rounded-xl h-11" data-testid="settings-phone-input" />
          </div>
        </div>
      </Card>

      <Card className="p-6 lg:p-8 rounded-2xl space-y-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-secondary" />
          <h2 className="font-heading text-lg font-semibold">Notifications</h2>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Email notifications</p>
              <p className="text-sm text-muted-foreground">Get emails for new events and announcements.</p>
            </div>
          </div>
          <Switch checked={form.email_notifications}
            onCheckedChange={(v) => setForm({ ...form, email_notifications: v })} data-testid="settings-email-switch" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Text (SMS) notifications</p>
              <p className="text-sm text-muted-foreground">Get a text for important updates. Requires a phone number.</p>
            </div>
          </div>
          <Switch checked={form.sms_notifications}
            onCheckedChange={(v) => setForm({ ...form, sms_notifications: v })} data-testid="settings-sms-switch" />
        </div>
      </Card>

      <Button onClick={save} disabled={saving} className="rounded-xl h-11 gap-2" data-testid="settings-save-button">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
      </Button>
    </div>
  );
}
