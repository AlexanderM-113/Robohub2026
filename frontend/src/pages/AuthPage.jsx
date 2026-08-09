import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import logo from "@/assets/logo.webp";
import { useAuth } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

const HERO =
  "https://images.unsplash.com/photo-1615551043360-33de8b5f410c?q=80&w=876&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";

export default function AuthPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [regData, setRegData] = useState({ name: "", email: "", password: "" });
  const [consent, setConsent] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", loginData);
      signIn(data.token, data.user);
      toast.success(`Welcome back, ${data.user.name}!`);
      navigate("/");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", regData);
      toast.success(data?.message || "Request sent — awaiting owner approval.");
      setRegData({ name: "", email: "", password: "" });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Hero */}
      <div className="relative hidden lg:block">
        <img src={HERO} alt="Robotics team" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-blue-950/90 via-blue-900/50 to-blue-700/30" />
        <div className="relative h-full flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-black/40 backdrop-blur flex items-center justify-center overflow-hidden">
              <img src={logo} alt="Robotics Hub" className="h-full w-full object-cover" />
            </div>
            <span className="font-heading font-bold text-xl">Robotics Hub</span>
          </div>
          <div className="max-w-md">
            <h1 className="font-heading text-4xl font-bold leading-tight mb-4">
              Build. Code. Compete. Together.
            </h1>
            <p className="text-white/80 text-lg">
              One home for your VEX & FRC team — channels, files, and the season calendar, all in one place.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col justify-center px-6 sm:px-12 py-12 relative">
        <div className="absolute top-6 right-6"><ThemeToggle /></div>
        <div className="w-full max-w-md mx-auto">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center overflow-hidden">
              <img src={logo} alt="Robotics Hub" className="h-full w-full object-cover" />
            </div>
            <span className="font-heading font-bold text-lg">Robotics Hub</span>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-8 rounded-xl">
              <TabsTrigger value="login" data-testid="login-tab" className="rounded-lg">Sign In</TabsTrigger>
              <TabsTrigger value="register" data-testid="register-tab" className="rounded-lg">Join Team</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <h2 className="font-heading text-2xl font-bold mb-1">Welcome back</h2>
              <p className="text-muted-foreground mb-6">Sign in to your team workspace.</p>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" required data-testid="login-email-input"
                    value={loginData.email} onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    placeholder="you@email.com" className="rounded-xl h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input id="login-password" type="password" required data-testid="login-password-input"
                    value={loginData.password} onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    placeholder="••••••••" className="rounded-xl h-11" />
                </div>
                <Button type="submit" disabled={loading} data-testid="login-submit-button"
                  className="w-full h-11 rounded-xl font-semibold">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <h2 className="font-heading text-2xl font-bold mb-1">Join your team</h2>
              <p className="text-muted-foreground mb-6">Request an account — the team owner will approve it before you can sign in.</p>
              <form onSubmit={handleRegister} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="reg-name">Full name</Label>
                  <Input id="reg-name" required data-testid="register-name-input"
                    value={regData.name} onChange={(e) => setRegData({ ...regData, name: e.target.value })}
                    placeholder="Alex Johnson" className="rounded-xl h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input id="reg-email" type="email" required data-testid="register-email-input"
                    value={regData.email} onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                    placeholder="you@email.com" className="rounded-xl h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input id="reg-password" type="password" required data-testid="register-password-input"
                    value={regData.password} onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                    placeholder="At least 6 characters" className="rounded-xl h-11" />
                </div>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border" required />
                  <span className="text-sm text-muted-foreground leading-snug">
                    I confirm that I (or my parent/school) consent to the collection of the information
                    above per the{" "}
                    <Link to="/privacy" className="text-primary underline underline-offset-2 hover:text-primary/80">
                      Privacy Policy
                    </Link>{" "}and{" "}
                    <Link to="/terms" className="text-primary underline underline-offset-2 hover:text-primary/80">
                      Terms of Service
                    </Link>.
                  </span>
                </label>
                <Button type="submit" disabled={loading || !consent} data-testid="register-submit-button"
                  className="w-full h-11 rounded-xl font-semibold">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request to Join"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="text-center text-xs text-muted-foreground mt-6">
            <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>
            {" · "}
            <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">Terms of Service</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
