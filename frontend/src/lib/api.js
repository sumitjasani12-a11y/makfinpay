import axios from "axios";

const rawBackend = process.env.REACT_APP_BACKEND_URL;
export const API = (rawBackend && rawBackend !== "undefined" && rawBackend !== "null")
  ? (rawBackend.endsWith("/api") ? rawBackend : `${rawBackend.replace(/\/$/, "")}/api`)
  : "/api";

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const t = localStorage.getItem("mfp_token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("mfp_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    if (error.response && error.response.status === 503) {
      if (window.location.pathname !== "/maintenance") {
        window.location.href = "/maintenance";
      }
    }
    return Promise.reject(error);
  }
);

export function formatErr(detail, fallback = null) {
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msg = detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
    return msg || fallback;
  }
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail) || fallback;
}

export function fmtMoney(n) {
  const v = Number(n || 0);
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(s) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return s;
  }
}

export function fileUrl(path) {
  const t = localStorage.getItem("mfp_token");
  return `${API}/files/${path}?auth=${encodeURIComponent(t || "")}`;
}
