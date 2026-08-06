import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, fileUrl } from "./api";
import { initWebSocket, closeWebSocket } from "./ws";
import { toast } from "sonner";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const v = localStorage.getItem("mfp_user");
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => {
    const t = localStorage.getItem("mfp_token");
    const u = localStorage.getItem("mfp_user");
    return Boolean(t && !u);
  });
  const [branding, setBranding] = useState(() => {
    try {
      const cached = localStorage.getItem("mfp_branding");
      return cached ? JSON.parse(cached) : { logo_path: "", logo_collapsed_path: "", favicon_path: "", watermark_path: "" };
    } catch {
      return { logo_path: "", logo_collapsed_path: "", favicon_path: "", watermark_path: "" };
    }
  });

  const fetchBranding = useCallback(() => {
    api.get("/settings/branding-public")
      .then((r) => {
        const val = r.data || { logo_path: "", logo_collapsed_path: "", favicon_path: "", watermark_path: "" };
        setBranding(val);
        try {
          localStorage.setItem("mfp_branding", JSON.stringify(val));
        } catch (e) {
          console.error(e);
        }
        if (val.favicon_path) {
          let link = document.querySelector("link[rel~='icon']");
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.getElementsByTagName("head")[0].appendChild(link);
          }
          link.href = fileUrl(val.favicon_path);
        }
      })
      .catch((e) => console.log("Failed to fetch branding settings:", e));
  }, []);

  useEffect(() => {
    if (branding?.favicon_path) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.getElementsByTagName("head")[0].appendChild(link);
      }
      link.href = fileUrl(branding.favicon_path);
    }
  }, [branding?.favicon_path]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  const reloadMe = useCallback(async () => {
    const t = localStorage.getItem("mfp_token");
    if (!t) return null;
    try {
      const r = await api.get("/auth/me");
      setUser(r.data);
      try { localStorage.setItem("mfp_user", JSON.stringify(r.data)); } catch (e) {}
      return r.data;
    } catch (e) {
      return null;
    }
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("mfp_token");
    if (!t) {
      setUser(null);
      try { localStorage.removeItem("mfp_user"); } catch (e) {}
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => {
        setUser(r.data);
        try { localStorage.setItem("mfp_user", JSON.stringify(r.data)); } catch (e) {}
      })
      .catch(() => {
        setUser(null);
        localStorage.removeItem("mfp_token");
        localStorage.removeItem("mfp_user");
      })
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
    window.addEventListener("ws:user_updated", reloadMe);
    window.addEventListener("ws:recharge_updated", reloadMe);
    window.addEventListener("ws:cc_bill_updated", reloadMe);
    return () => {
      window.removeEventListener("ws:kyc_updated", reloadMe);
      window.removeEventListener("ws:user_updated", reloadMe);
      window.removeEventListener("ws:recharge_updated", reloadMe);
      window.removeEventListener("ws:cc_bill_updated", reloadMe);
    };
  }, [reloadMe]);

  const completeLogin = useCallback((token, userData) => {
    if (token) {
      localStorage.setItem("mfp_token", token);
    }
    if (userData) {
      setUser(userData);
      try { localStorage.setItem("mfp_user", JSON.stringify(userData)); } catch (e) {}
    }
    if (token) {
      initWebSocket(token);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.token) {
      completeLogin(data.token, data.user);
    }
    return data;
  }, [completeLogin]);

  const logout = useCallback(() => {
    localStorage.removeItem("mfp_token");
    localStorage.removeItem("mfp_user");
    setUser(null);
    closeWebSocket();
  }, []);

  const val = useMemo(
    () => ({ user, loading, login, logout, completeLogin, reloadMe, branding, fetchBranding }),
    [user, loading, login, logout, completeLogin, reloadMe, branding, fetchBranding]
  );

  return <AuthCtx.Provider value={val}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
