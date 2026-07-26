import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("mfp_token");
    if (!t) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => localStorage.removeItem("mfp_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("mfp_token", data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (_err) {
      // logout endpoint is best-effort; ignore network errors and still clear local state
    }
    localStorage.removeItem("mfp_token");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, setUser }),
    [user, loading, login, logout]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
