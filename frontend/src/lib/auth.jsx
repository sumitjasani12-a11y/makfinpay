import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, fileUrl } from "./api";
import { initWebSocket, closeWebSocket } from "./ws";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState({ logo_path: "", logo_collapsed_path: "", favicon_path: "", watermark_path: "" });

  const fetchBranding = useCallback(() => {
    api.get("/settings/branding-public")
      .then((r) => {
        setBranding(r.data || { logo_path: "", logo_collapsed_path: "", favicon_path: "", watermark_path: "" });
        if (r.data?.favicon_path) {
          let link = document.querySelector("link[rel~='icon']");
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.getElementsByTagName("head")[0].appendChild(link);
          }
          link.href = fileUrl(r.data.favicon_path);
        }
      })
      .catch((e) => console.log("Failed to fetch branding settings:", e));
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  const reloadMe = useCallback(() => {
    const t = localStorage.getItem("mfp_token");
    if (!t) return;
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => {});
  }, []);

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

  useEffect(() => {
    const t = localStorage.getItem("mfp_token");
    if (user && t) {
      initWebSocket(t);
    } else {
      closeWebSocket();
    }
  }, [user]);

  useEffect(() => {
    window.addEventListener("ws:kyc_updated", reloadMe);
    window.addEventListener("ws:recharge_updated", reloadMe);
    window.addEventListener("ws:cc_bill_updated", reloadMe);
    return () => {
      window.removeEventListener("ws:kyc_updated", reloadMe);
      window.removeEventListener("ws:recharge_updated", reloadMe);
      window.removeEventListener("ws:cc_bill_updated", reloadMe);
    };
  }, [reloadMe]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.status === "success") {
      localStorage.setItem("mfp_token", data.token);
      setUser(data.user);
    }
    return data;
  }, []);

  const completeLogin = useCallback((token, user) => {
    localStorage.setItem("mfp_token", token);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (_err) {
      // logout endpoint is best-effort; ignore network errors and still clear local state
    }
    localStorage.removeItem("mfp_token");
    setUser(null);
    closeWebSocket();
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, setUser, completeLogin, reloadMe, branding, fetchBranding }),
    [user, loading, login, logout, completeLogin, reloadMe, branding, fetchBranding]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
