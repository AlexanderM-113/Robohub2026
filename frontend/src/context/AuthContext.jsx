import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading
  const [ready, setReady] = useState(false);

  const loadMe = useCallback(async () => {
    const token = localStorage.getItem("rh_token");
    if (!token) {
      setUser(false);
      setReady(true);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      localStorage.removeItem("rh_token");
      setUser(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const signIn = (token, userData) => {
    localStorage.setItem("rh_token", token);
    setUser(userData);
  };

  const signOut = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      /* ignore */
    }
    localStorage.removeItem("rh_token");
    setUser(false);
  };

  const updateUser = (u) => setUser(u);

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
