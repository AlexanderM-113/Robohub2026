import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import Chat from "@/pages/Chat";
import Files from "@/pages/Files";
import CalendarPage from "@/pages/CalendarPage";
import Settings from "@/pages/Settings";
import TeamPage from "@/pages/TeamPage";

function LoginRoute() {
  const { user, ready } = useAuth();
  if (ready && user) return <Navigate to="/" replace />;
  return <AuthPage />;
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/files" element={<Files />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/team" element={<TeamPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
