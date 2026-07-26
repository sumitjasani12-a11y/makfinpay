import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const t = localStorage.getItem("mfp_token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export function formatErr(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
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
