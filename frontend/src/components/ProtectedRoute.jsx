import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }) {
  const { user, ready } = useAuth();
  if (!ready || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
