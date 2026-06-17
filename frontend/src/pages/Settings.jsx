import { useEffect, useState } from "react";
import { Bell, Mail, MessageSquare, Loader2, User, Smartphone, Check } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { pushSupported, enablePush, disablePush, getExistingSubscription } from "@/lib/push";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const CARRIERS = [
  { value: "verizon", label: "Verizon" },
  { value: "att", label: "AT&T" },
  { value: "tmobile", label: "T-Mobile" },
  { value: "sprint", label: "Sprint" },
  { value: "boost", label: "Boost Mobile" },
  { value: "cricket", label: "Cricket" },
  { value: "uscellular", label: "US Cellular" },
  { value: "metropcs", label: "Metro by T-Mobile" },
  { value: "googlefi", label: "Google Fi" },
  { value: "xfinity", label: "Xfinity Mobile" },
  { value: "virgin", label: "Virgin Mobile" },
];

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    carrier: user?.carrier || "",
    email_notifications: user?.email_notifications ?? true,
    sms_notifications: user?.sms_notifications ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (pushSupported()) getExistingSubscription().then((s) => setPushOn(!!s));
  }, []);

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

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        toast.success("Push notifications disabled on this device");
      } else {
        await enablePush();
        setPushOn(true);
        toast.success("Push notifications enabled! You'll get alerts for new messages.");
      }
    } catch (err) {
      toast.error(err.message || "Could not update push notifications");
    } finally {
      setPushBusy(false);
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
        </div>
      </Card>

      {/* Push notifications */}
      <Card className="p-6 lg:p-8 rounded-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">Phone Push Notifications</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Get a real push notification on this phone/computer the moment a new message is posted — completely free.
          On iPhone, add this site to your Home Screen first, then enable.
        </p>
        {pushSupported() ? (
          <Button onClick={togglePush} disabled={pushBusy} variant={pushOn ? "outline" : "default"}
            className="rounded-xl h-11 gap-2" data-testid="push-toggle-button">
            {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : pushOn ? <Check className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {pushOn ? "Push enabled on this device — tap to disable" : "Enable push on this device"}
          </Button>
        ) : (
          <p className="text-sm text-secondary-foreground bg-secondary/15 rounded-xl p-3">
            Push isn't supported in this browser. Try Chrome on Android, or add to Home Screen on iPhone (iOS 16.4+).
          </p>
        )}
      </Card>

      {/* Email-to-SMS */}
      <Card className="p-6 lg:p-8 rounded-2xl space-y-5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-secondary" />
          <h2 className="font-heading text-lg font-semibold">Text (SMS) Alerts</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Free text alerts for new messages via your carrier's email-to-SMS gateway (US carriers). Requires your
          phone number and carrier.
        </p>
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label>Phone number</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(602) 555-0123" className="rounded-xl h-11" data-testid="settings-phone-input" />
          </div>
          <div className="space-y-2">
            <Label>Carrier</Label>
            <Select value={form.carrier} onValueChange={(v) => setForm({ ...form, carrier: v })}>
              <SelectTrigger className="rounded-xl h-11" data-testid="settings-carrier-select">
                <SelectValue placeholder="Select carrier" />
              </SelectTrigger>
              <SelectContent>
                {CARRIERS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div>
            <p className="font-medium">Enable text alerts</p>
            <p className="text-sm text-muted-foreground">Get a text for every new chat message.</p>
          </div>
          <Switch checked={form.sms_notifications}
            onCheckedChange={(v) => setForm({ ...form, sms_notifications: v })} data-testid="settings-sms-switch" />
        </div>
      </Card>

      {/* Weekly email digest */}
      <Card className="p-6 lg:p-8 rounded-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">Weekly Email Digest</h2>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="font-medium">Wednesday weekly summary</p>
              <p className="text-sm text-muted-foreground">
                Every Wednesday at 10 AM (Arizona) — new messages per channel, new files, and upcoming events.
              </p>
            </div>
          </div>
          <Switch checked={form.email_notifications}
            onCheckedChange={(v) => setForm({ ...form, email_notifications: v })} data-testid="settings-email-switch" />
        </div>
      </Card>

      <Button onClick={save} disabled={saving} className="rounded-xl h-11 gap-2" data-testid="settings-save-button">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
      </Button>
    </div>
  );
}
